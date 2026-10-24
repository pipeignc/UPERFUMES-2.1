/**
 * Pruebas de punta a punta: levanta el servidor real, abre las páginas reales
 * en jsdom y simula clics, carrito, idioma, formularios y un pago Webpay
 * (la respuesta de Transbank se simula: no se llama a su servidor).
 *
 *   npm install        (instala jsdom como dependencia de desarrollo)
 *   npm test
 *
 * Usa una base de datos temporal; no toca data/uperfumes.sqlite.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
process.chdir(ROOT);
const TEST_DB = path.join(os.tmpdir(), "uperfumes-e2e.sqlite");
for (const f of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.DATABASE_PATH = TEST_DB;
process.env.PUBLIC_BASE_URL = "http://localhost:3111";
process.env.TRANSBANK_ENVIRONMENT = "integration";

const app = require(path.join(ROOT, "src/app"));
const webpay = require(path.join(ROOT, "src/services/webpay"));
const db = require(path.join(ROOT, "src/db"));
const { JSDOM, VirtualConsole, requestInterceptor } = require("jsdom");

const BASE = "http://localhost:3111";
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log("  PASS ", label); } else { fail++; console.log("  FAIL ", label); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }

// Solo se cargan recursos del servidor local; fuentes de Google y demás se responden vacíos.
const RESOURCES = {
  interceptors: [requestInterceptor((request) => {
    if (!request.url.startsWith(BASE)) return new Response("", { headers: { "Content-Type": "text/css" } });
  })]
};

async function loadPage(pathAndQuery, { storage = {} } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const dom = await JSDOM.fromURL(BASE + pathAndQuery, {
    runScripts: "dangerously", resources: RESOURCES, pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.Element.prototype.scrollIntoView = function () {};
      window.HTMLElement.prototype.focus = window.HTMLElement.prototype.focus || function () {};
      window.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
      window.__submitted = null;
      window.HTMLFormElement.prototype.submit = function () {
        window.__submitted = { action: this.getAttribute("action"), token: (this.querySelector('[name="token_ws"]') || {}).value };
      };
      for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
    }
  });
  await new Promise((res) => { if (dom.window.document.readyState === "complete") res(); else dom.window.addEventListener("load", res); });
  await sleep(250);
  dom.errors = errors;
  return dom;
}
const $ = (dom, sel) => dom.window.document.querySelector(sel);
const $$ = (dom, sel) => [...dom.window.document.querySelectorAll(sel)];
const click = (dom, sel) => { const el = typeof sel === "string" ? $(dom, sel) : sel; el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); };

// ¿Está visible? (jsdom solo aplica el atributo hidden; el choque hidden vs display:flex lo cubre la prueba [10])
function isShown(dom, el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (dom.window.getComputedStyle(n).display === "none") return false;
  }
  return true;
}
function fillForm(dom) {
  $(dom, "#fName").value = "Ana Soto"; $(dom, "#fEmail").value = "ana@test.cl"; $(dom, "#fAddress").value = "Av. Siempre Viva 742, Santiago";
}
function submit(dom) { $(dom, "#orderForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }

(async () => {
  const server = app.listen(3111);
  await sleep(200);

  /* ---------------- 1) index.html ---------------- */
  console.log("\n[1] index.html: catálogo, panel de compra y carrito lateral");
  let dom = await loadPage("/index.html");
  ok(dom.errors.length === 0, "carga sin errores de script" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(!!$(dom, "#pageHub #cartToggle"), "el botón del carrito está dentro del HUB");
  ok(!!$(dom, "#cartDrawer"), "existe el panel lateral del carrito");
  ok($$(dom, ".perfume-card__imglink").length === 11, "11 fotos enlazan a su ficha");
  ok($$(dom, ".perfume-card__namelink").length === 11, "11 nombres enlazan a su ficha");
  ok($(dom, '.perfume-card__imglink[href="producto.html?id=dior-sauvage-edt"]'), "el enlace apunta a producto.html?id=...");
  ok(!!dom.window.UPerfumes && !!dom.window.UPCart, "UPerfumes y UPCart disponibles");

  click(dom, '.decant-buy[data-perfume="dior-sauvage-edt"][data-ml="5"]');
  await sleep(100);
  ok(!!$(dom, "#buyAddBtn") && !!$(dom, "#buyNowLink"), "al elegir formato aparecen 'Agregar al carrito' y 'Comprar ahora'");
  ok($(dom, "#buyNowLink").getAttribute("href") === "pedido.html?id=dior-sauvage-edt&ml=5&qty=1", "'Comprar ahora' -> " + $(dom, "#buyNowLink").getAttribute("href"));
  // cambiar de formato en el panel actualiza el enlace
  click(dom, '#buyFormats .filter-chip[data-ml="10"]');
  ok($(dom, "#buyNowLink").getAttribute("href") === "pedido.html?id=dior-sauvage-edt&ml=10&qty=1", "al cambiar a 10 ml el enlace se actualiza");
  click(dom, '#buyFormats .filter-chip[data-ml="5"]');

  click(dom, "#buyAddBtn");
  ok(dom.window.UPCart.count() === 1, "agregar al carrito -> 1 unidad");
  ok($(dom, "#cartDrawer").classList.contains("is-open"), "el panel se despliega solo al agregar");
  ok(dom.window.document.body.classList.contains("cart-open"), "body.cart-open (el HUB se corre junto al panel)");
  ok(await waitFor(() => /Sauvage/.test($(dom, "#cartDrawerBody").textContent)), "el panel muestra el producto");
  ok($(dom, "#cartDrawerSubtotal").textContent === "$11.490", "subtotal $11.490 -> " + $(dom, "#cartDrawerSubtotal").textContent);
  ok($(dom, "#cartBadge").textContent === "1" && !$(dom, "#cartBadge").hidden, "el contador del HUB marca 1");
  ok($(dom, '#cartDrawer a[href="carrito.html"]').textContent.trim() === "Ir a carrito", "botón 'Ir a carrito' -> carrito.html");

  click(dom, '#cartDrawer [data-cart-action="inc"]');
  ok(await waitFor(() => $(dom, "#cartDrawerSubtotal").textContent === "$22.980"), "cantidad 2 -> subtotal $22.980");
  ok($(dom, "#cartBadge").textContent === "2", "contador 2");
  click(dom, '#cartDrawer [data-cart-action="dec"]');
  ok(await waitFor(() => $(dom, "#cartDrawerSubtotal").textContent === "$11.490"), "restar vuelve a $11.490");

  // agregar otro formato distinto = otra línea
  click(dom, '.decant-buy[data-perfume="mykonos-inception"][data-ml="3"]');
  await sleep(60); click(dom, "#buyAddBtn");
  ok(await waitFor(() => $$(dom, "#cartDrawerBody .cart-line").length === 2), "otro perfume crea una segunda línea");
  ok(await waitFor(() => $(dom, "#cartDrawerSubtotal").textContent === "$15.480"), "subtotal 11.490 + 3.990 = $15.480");
  ok(JSON.parse(dom.window.localStorage.getItem("up_cart_v1")).length === 2, "el carrito quedó guardado en el navegador");

  // cerrar con Escape y con el scrim
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!$(dom, "#cartDrawer").classList.contains("is-open"), "Escape cierra el panel");
  click(dom, "#cartToggle");
  ok($(dom, "#cartDrawer").classList.contains("is-open"), "el botón del HUB abre el panel");
  click(dom, "#cartScrim");
  ok(!$(dom, "#cartDrawer").classList.contains("is-open"), "clic fuera lo cierra");

  // quitar
  click(dom, "#cartToggle");
  click(dom, '#cartDrawer [data-cart-action="remove"][data-id="mykonos-inception"]');
  ok(await waitFor(() => $$(dom, "#cartDrawerBody .cart-line").length === 1), "'Quitar' elimina la línea");

  // idioma
  click(dom, '.hub-lang__btn[data-lang="en"]');
  await sleep(150);
  ok(/Your cart/.test($(dom, "#cartTitle").textContent), "idioma EN: el panel dice 'Your cart'");
  ok($(dom, '#cartDrawer a[href="carrito.html"]').textContent.trim() === "Go to cart", "idioma EN: 'Go to cart'");
  ok(/Remove/.test($(dom, "#cartDrawerBody").textContent), "idioma EN: filas traducidas ('Remove')");
  ok(dom.window.localStorage.getItem("up_lang") === "en", "el idioma queda guardado");
  click(dom, '.decant-buy[data-perfume="dior-sauvage-edt"][data-ml="3"]');
  await sleep(60);
  ok($(dom, "#buyAddBtn").textContent === "Add to cart" && $(dom, "#buyNowLink").textContent === "Buy now", "idioma EN: botones 'Add to cart' / 'Buy now'");
  dom.window.close();

  /* ---------------- 2) producto.html ---------------- */
  console.log("\n[2] producto.html: foto centrada, formatos y botones");
  dom = await loadPage("/producto.html?id=mykonos-inception&ml=10");
  ok(dom.errors.length === 0, "carga sin errores de script" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(await waitFor(() => !$(dom, "#productInfo").hidden), "la ficha se dibuja");
  ok($(dom, "#productImage").getAttribute("src") === "images/mykonos-inception.jpg", "la foto apunta a images/mykonos-inception.jpg");
  ok(/Inception/.test($(dom, "#productTitle").textContent) && $(dom, "#productHouse").textContent === "Mykonos", "nombre y casa");
  ok($$(dom, "#productFormats input").length === 3, "3 formatos (3, 5 y 10 ml)");
  ok($(dom, '#productFormats input[value="10"]').checked, "ml=10 llega preseleccionado");
  ok($(dom, "#productTotal").textContent === "$8.990", "total $8.990 (precio fijo Inception 10 ml)");
  ok(/Floral acuática/.test($(dom, "#productFamily").textContent) && $(dom, "#productDesc").textContent.length > 20, "familia y descripción del perfume");
  ok(/Salida/.test($(dom, "#productNotes").textContent), "notas de salida/corazón/fondo");
  click(dom, "#productQtyInc");
  ok($(dom, "#productTotal").textContent === "$17.980", "cantidad 2 -> $17.980");
  ok($(dom, "#productBuyNow").getAttribute("href") === "pedido.html?id=mykonos-inception&ml=10&qty=2", "'Comprar ahora' -> " + $(dom, "#productBuyNow").getAttribute("href"));
  const r5 = $(dom, '#productFormats input[value="5"]'); r5.checked = true; r5.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  ok($(dom, "#productTotal").textContent === "$11.980", "cambiar a 5 ml (qty 2) -> $11.980");
  click(dom, "#productAddCart");
  ok(dom.window.UPCart.count() === 2 && $(dom, "#cartDrawer").classList.contains("is-open"), "'Agregar al carrito' suma 2 y abre el panel");
  click(dom, '.hub-lang__btn[data-lang="pt"]'); await sleep(100);
  ok(/Adicionar ao carrinho/.test($(dom, "#productAddCart").textContent), "idioma PT: 'Adicionar ao carrinho'");
  ok(/Notas|Saída/.test($(dom, "#productNotes").textContent), "idioma PT: notas traducidas");
  dom.window.close();

  dom = await loadPage("/producto.html?id=no-existe");
  ok(await waitFor(() => !$(dom, "#productEmpty").hidden) && $(dom, "#productLayout").hidden, "perfume inexistente -> mensaje 'no encontramos'");
  dom.window.close();
  dom = await loadPage("/producto.html?id=../../etc/passwd");
  ok(await waitFor(() => !$(dom, "#productEmpty").hidden) && !$(dom, "#productImage").getAttribute("src"), "id malicioso: no se usa para la imagen");
  dom.window.close();

  /* ---------------- 3) carrito.html ---------------- */
  console.log("\n[3] carrito.html: lista, total y pago");
  const cart = JSON.stringify([{ id: "dior-sauvage-edt", ml: 3, qty: 2 }, { id: "dior-homme-intense", ml: 10, qty: 1 }]);
  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: cart } });
  ok(dom.errors.length === 0, "carga sin errores de script" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(await waitFor(() => $$(dom, "#cartPageList .cart-line").length === 2), "2 líneas en la página del carrito");
  ok($(dom, "#cartPageTotal").textContent === "$40.970", "total 2×6.990 + 26.990 = $40.970 -> " + $(dom, "#cartPageTotal").textContent);
  ok($(dom, '#orderForm input[name="pago"]:checked').value === "webpay", "Webpay es el método por defecto");
  ok($(dom, "#orderSubmit").textContent.trim() === "Pagar con Webpay", "el botón dice 'Pagar con Webpay'");
  click(dom, '#orderForm input[value="transferencia"]'); $(dom, '#orderForm input[value="transferencia"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  ok($(dom, "#orderSubmit").textContent.trim() === "Confirmar pedido", "con transferencia dice 'Confirmar pedido'");
  $(dom, '#orderForm input[value="webpay"]').checked = true; $(dom, '#orderForm input[value="webpay"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));

  // formulario vacío no se envía
  const before = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  submit(dom); await sleep(200);
  ok(db.prepare("SELECT COUNT(*) c FROM orders").get().c === before, "formulario vacío: no se crea ningún pedido");

  // WEBPAY (simulado): Transbank no es alcanzable desde este sandbox, así que se simula su respuesta
  let createdArgs = null;
  webpay.createTransaction = async (args) => { createdArgs = args; return { token: "TOKEN_TEST_123", url: "https://webpay3gint.transbank.cl/webpayserver/initTransaction" }; };
  fillForm(dom); submit(dom);
  ok(await waitFor(() => dom.window.__submitted !== null), "Webpay: el navegador redirige a Transbank");
  ok(dom.window.__submitted && dom.window.__submitted.token === "TOKEN_TEST_123" && /transbank/.test(dom.window.__submitted.action), "se envía POST token_ws a la URL de Transbank");
  ok(createdArgs && createdArgs.amount === 40970, "el servidor creó la transacción por $40.970 (calculado en el servidor)");
  ok(dom.window.UPCart.count() === 3, "el carrito se conserva hasta que el pago vuelva aprobado");
  const orderRow = db.prepare("SELECT * FROM orders WHERE webpay_token = 'TOKEN_TEST_123'").get();
  ok(orderRow && orderRow.status === "pending_webpay" && orderRow.amount === 40970, "pedido guardado como pending_webpay, $40.970");
  ok(db.prepare("SELECT COUNT(*) c FROM order_items WHERE order_id = ?").get(orderRow.id).c === 2, "con sus 2 ítems en la base de datos");
  const pending = dom.window.localStorage.getItem("up_cart_pending_v1");
  ok(pending === orderRow.buy_order, "el carrito quedó marcado como 'pago pendiente'");
  const storageForReturn = { up_cart_v1: dom.window.localStorage.getItem("up_cart_v1"), up_cart_pending_v1: pending };
  dom.window.close();

  /* ---------------- 4) vuelta desde Webpay ---------------- */
  console.log("\n[4] vuelta de Webpay -> confirmacion.html");
  webpay.commitTransaction = async () => ({
    buy_order: orderRow.buy_order, amount: 40970, status: "AUTHORIZED", response_code: 0, authorization_code: "1213",
    card_detail: { card_number: "6623" }, transaction_date: "2026-10-01T12:00:00.000Z"
  });
  let r = await fetch(BASE + "/webpay/retorno?token_ws=TOKEN_TEST_123", { redirect: "manual" });
  ok(r.status === 302 && r.headers.get("location") === "/confirmacion.html?order=" + orderRow.buy_order, "GET /webpay/retorno -> redirige a la confirmación");
  ok(db.prepare("SELECT status FROM orders WHERE id = ?").get(orderRow.id).status === "approved", "pedido pasa a 'approved'");
  let commitCalls = 0; webpay.commitTransaction = async () => { commitCalls++; throw new Error("no debería llamarse"); };
  r = await fetch(BASE + "/webpay/retorno?token_ws=TOKEN_TEST_123", { redirect: "manual" });
  ok(r.status === 302 && r.headers.get("location").includes(orderRow.buy_order) && commitCalls === 0, "recargar la vuelta NO confirma de nuevo (idempotente)");

  dom = await loadPage("/confirmacion.html?order=" + orderRow.buy_order, { storage: storageForReturn });
  ok(dom.errors.length === 0, "confirmacion.html sin errores de script" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(await waitFor(() => !$(dom, "#confirmApproved").hidden), "se muestra 'Pago aprobado'");
  ok($$(dom, "#apItems li").length === 2 && /Sauvage/.test($(dom, "#apItems").textContent), "lista los 2 productos del pedido");
  ok($(dom, "#apAmount").textContent === "$40.970" && $(dom, "#apAuthCode").textContent === "1213" && /6623/.test($(dom, "#apCard").textContent), "monto, código de autorización y tarjeta");
  ok(await waitFor(() => dom.window.UPCart.count() === 0), "con el pago aprobado, el carrito se vacía");
  ok(dom.window.localStorage.getItem("up_cart_pending_v1") === null, "se limpia la marca de pago pendiente");
  dom.window.close();

  // rechazado conserva el carrito
  webpay.createTransaction = async () => ({ token: "TOKEN_RECHAZO", url: "https://x" });
  let created = await (await fetch(BASE + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ perfumeId: "azzaro-most-wanted-intense", ml: 3, qty: 1 }], customerName: "Luis", customerEmail: "l@l.cl", deliveryAddress: "Calle 12345", paymentMethod: "webpay" }) })).json();
  webpay.commitTransaction = async () => ({ buy_order: created.buyOrder, amount: 7490, status: "FAILED", response_code: -1, card_detail: { card_number: "0568" } });
  await fetch(BASE + "/webpay/retorno?token_ws=TOKEN_RECHAZO", { redirect: "manual" });
  dom = await loadPage("/confirmacion.html?order=" + created.buyOrder, { storage: { up_cart_v1: cart, up_cart_pending_v1: created.buyOrder } });
  ok(await waitFor(() => !$(dom, "#confirmRejected").hidden), "pago rechazado -> 'Pago rechazado'");
  await sleep(150);
  ok(dom.window.UPCart.count() === 3, "pago rechazado: el carrito NO se vacía");
  dom.window.close();

  // monto distinto
  webpay.createTransaction = async () => ({ token: "TOKEN_MONTO", url: "https://x" });
  created = await (await fetch(BASE + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ perfumeId: "azzaro-most-wanted-intense", ml: 3, qty: 1 }], customerName: "Luis", customerEmail: "l@l.cl", deliveryAddress: "Calle 12345", paymentMethod: "webpay" }) })).json();
  webpay.commitTransaction = async () => ({ buy_order: created.buyOrder, amount: 1, status: "AUTHORIZED", response_code: 0, authorization_code: "9", card_detail: { card_number: "1111" } });
  r = await fetch(BASE + "/webpay/retorno?token_ws=TOKEN_MONTO", { redirect: "manual" });
  ok(r.headers.get("location") === "/confirmacion.html?error=1" && db.prepare("SELECT status FROM orders WHERE buy_order = ?").get(created.buyOrder).status === "amount_mismatch", "monto cobrado distinto al del pedido -> NO se da por aprobado");

  // cancelado
  created = await (await fetch(BASE + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ perfumeId: "azzaro-most-wanted-intense", ml: 3, qty: 1 }], customerName: "Luis", customerEmail: "l@l.cl", deliveryAddress: "Calle 12345", paymentMethod: "webpay" }) })).json();
  r = await fetch(BASE + "/webpay/retorno", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "TBK_TOKEN=x&TBK_ID_SESION=y&TBK_ORDEN_COMPRA=" + created.buyOrder });
  ok(r.headers.get("location").includes("cancelado=1") && db.prepare("SELECT status FROM orders WHERE buy_order = ?").get(created.buyOrder).status === "cancelled", "pago cancelado -> estado 'cancelled', sin llamar a commit");

  /* ---------------- 5) pedido.html (comprar ahora) ---------------- */
  console.log("\n[5] pedido.html: comprar ahora");
  dom = await loadPage("/pedido.html?id=dior-homme-intense&ml=10&qty=2", { storage: { up_cart_v1: cart } });
  ok(dom.errors.length === 0, "carga sin errores de script" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(await waitFor(() => !$(dom, "#orderSummary").hidden), "se muestra el resumen con la foto");
  ok($(dom, "#orderImage").getAttribute("src") === "images/dior-homme-intense.jpg", "foto del perfume seleccionado");
  ok(/10 ml × 2/.test($(dom, "#orderPrice").textContent) && /\$53\.980/.test($(dom, "#orderPrice").textContent), "resumen: 10 ml × 2 — $53.980");
  click(dom, '#orderForm input[value="transferencia"]'); $(dom, '#orderForm input[value="transferencia"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  fillForm(dom); submit(dom);
  ok(await waitFor(() => !$(dom, "#orderResult").hidden), "transferencia: se muestran los datos bancarios");
  ok($(dom, "#resultAmount").textContent === "$53.980", "monto a transferir $53.980");
  ok(dom.window.UPCart.count() === 3, "'Comprar ahora' NO toca el carrito");
  dom.window.close();

  dom = await loadPage("/pedido.html");
  ok(await waitFor(() => !$(dom, "#orderEmpty").hidden), "sin producto: mensaje de pedido vacío");
  dom.window.close();

  /* ---------------- 6) carrito: transferencia vacía el carrito / carrito vacío ---------------- */
  console.log("\n[6] carrito.html: transferencia y carrito vacío");
  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: cart } });
  await waitFor(() => $$(dom, "#cartPageList .cart-line").length === 2);
  click(dom, '#orderForm input[value="transferencia"]'); $(dom, '#orderForm input[value="transferencia"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  fillForm(dom); submit(dom);
  ok(await waitFor(() => !$(dom, "#orderResult").hidden), "transferencia desde el carrito: pedido recibido");
  ok($(dom, "#resultAmount").textContent === "$40.970", "monto a transferir $40.970");
  ok(dom.window.UPCart.count() === 0 && $(dom, "#cartPageContent").hidden, "el carrito se vacía y la lista se oculta");
  dom.window.close();
  dom = await loadPage("/carrito.html");
  ok(await waitFor(() => !$(dom, "#cartPageEmpty").hidden) && $(dom, "#cartPageContent").hidden, "carrito vacío: mensaje y enlace a la colección");
  dom.window.close();

  /* ---------------- 7) robustez del carrito guardado ---------------- */
  console.log("\n[7] robustez");
  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: JSON.stringify([{ id: "dior-sauvage-edt", ml: 7, qty: 1 }, { id: "x", ml: 3, qty: -4 }, { id: "perfume-borrado", ml: 3, qty: 1 }, { id: "dior-sauvage-edt", ml: 3, qty: 99 }, "basura"]) } });
  await waitFor(() => $$(dom, "#cartPageList .cart-line").length >= 1);
  await sleep(300);
  ok(JSON.stringify(dom.window.UPCart.items()) === JSON.stringify([{ id: "dior-sauvage-edt", ml: 3, qty: 10 }]), "ml inválido, cantidad negativa y basura se descartan -> " + JSON.stringify(dom.window.UPCart.items()));
  ok($$(dom, "#cartPageList .cart-line").length === 1 && dom.window.UPCart.items().length === 1, "el perfume que ya no existe se saca del carrito");
  ok(dom.window.UPCart.items()[0].qty === 10, "cantidad 99 se limita a 10");
  dom.window.close();
  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: "{no es json" } });
  ok(dom.errors.length === 0 && dom.window.UPCart.count() === 0, "JSON corrupto: no rompe la página");
  dom.window.close();


  /* ---------------- 8) tema e idioma guardados, recomendador ---------------- */
  console.log("\n[8] preferencias guardadas y recomendador");
  dom = await loadPage("/carrito.html", { storage: { up_lang: "pt", up_theme: "light", up_cart_v1: cart } });
  ok(dom.errors.length === 0, "carga con idioma/tema guardados sin errores" + (dom.errors.length ? " -> " + dom.errors.join(" | ") : ""));
  ok(dom.window.document.documentElement.getAttribute("data-theme") === "light" && $(dom, "#themeToggle").getAttribute("aria-checked") === "true", "se restaura el modo claro");
  ok(dom.window.document.documentElement.lang === "pt-PT" && /O teu carrinho/.test($(dom, "h1").textContent), "se restaura el idioma portugués");
  ok(/O teu carrinho/.test($(dom, "#cartTitle").textContent), "el panel del carrito (inyectado) también queda en portugués");
  ok(await waitFor(() => /Remover/.test($(dom, "#cartPageList").textContent)), "las filas del carrito también");
  ok($(dom, '.hub-lang__btn[data-lang="pt"]').classList.contains("is-active"), "la bandera activa es la de Portugal");
  click(dom, "#themeToggle");
  ok(dom.window.localStorage.getItem("up_theme") === "dark", "volver a modo oscuro también se guarda");
  dom.window.close();

  dom = await loadPage("/index.html");
  for (const group of ["occasion:noche", "climate:frio", "age:26-35", "budget:cualquiera"]) {
    const [field, value] = group.split(":");
    click(dom, `.finder-options[data-field="${field}"] [data-value="${value}"]`);
  }
  ok(!$(dom, "#finderSubmit").disabled, "recomendador: botón activo con las 4 respuestas");
  $(dom, "#finderForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(100);
  ok($$(dom, ".finder-card .perfume-card__imglink").length === 3, "las 3 recomendaciones enlazan a su ficha");
  ok($$(dom, ".finder-card .perfume-card__namelink").length === 3, "y también por el nombre");
  click(dom, ".finder-card .decant-buy");
  await sleep(80);
  ok(!!$(dom, "#buyAddBtn"), "desde una recomendación también se puede agregar al carrito");
  dom.window.close();

  /* ---------------- 9) lo que realmente se ve (CSS aplicado) ---------------- */
  console.log("\n[9] qué panel queda visible en cada estado (atributo hidden; el choque con display:flex lo cubre [10])");
  const seeded = JSON.stringify([{ id: "dior-sauvage-edt", ml: 3, qty: 2 }]);

  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: seeded } });
  await waitFor(() => $$(dom, "#cartPageList .cart-line").length === 1);
  ok(isShown(dom, $(dom, "#cartPageContent")), "carrito con productos: se ve la lista y el pago");
  ok(!isShown(dom, $(dom, "#cartPageEmpty")), "carrito con productos: NO se ve el mensaje 'carrito vacío'");
  ok(!isShown(dom, $(dom, "#orderResult")) && !isShown(dom, $(dom, "#orderError")), "no se ven el resultado ni los errores antes de tiempo");
  dom.window.UPCart.clear();
  await sleep(150);
  ok(isShown(dom, $(dom, "#cartPageEmpty")) && !isShown(dom, $(dom, "#cartPageContent")), "al vaciar el carrito: se ve el mensaje y se oculta la lista");
  dom.window.close();

  dom = await loadPage("/carrito.html");
  await sleep(200);
  ok(isShown(dom, $(dom, "#cartPageEmpty")) && !isShown(dom, $(dom, "#cartPageContent")), "carrito vacío: solo se ve el mensaje");
  dom.window.close();

  dom = await loadPage("/carrito.html", { storage: { up_cart_v1: seeded } });
  await waitFor(() => $$(dom, "#cartPageList .cart-line").length === 1);
  click(dom, '#orderForm input[value="transferencia"]'); $(dom, '#orderForm input[value="transferencia"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  fillForm(dom); submit(dom);
  await waitFor(() => !$(dom, "#orderResult").hidden);
  ok(isShown(dom, $(dom, "#orderResult")), "transferencia desde el carrito: se ve el resultado");
  ok(!isShown(dom, $(dom, "#cartPageContent")) && !isShown(dom, $(dom, "#cartPageEmpty")), "y no se ve ni la lista ni el mensaje de carrito vacío");
  dom.window.close();

  dom = await loadPage("/pedido.html?id=dior-sauvage-edt&ml=3&qty=1");
  await waitFor(() => !$(dom, "#orderSummary").hidden);
  ok(isShown(dom, $(dom, "#orderSummary")) && isShown(dom, $(dom, "#orderForm")), "pedido válido: se ven el resumen y el formulario");
  ok(!isShown(dom, $(dom, "#orderEmpty")) && !isShown(dom, $(dom, "#orderResult")), "pedido válido: no se ve ni el aviso de vacío ni el resultado");
  click(dom, '#orderForm input[value="transferencia"]'); $(dom, '#orderForm input[value="transferencia"]').dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  fillForm(dom); submit(dom);
  await waitFor(() => !$(dom, "#orderResult").hidden);
  ok(isShown(dom, $(dom, "#orderResult")) && !isShown(dom, $(dom, "#orderForm")), "tras transferir: se ve el resultado y el formulario desaparece");
  dom.window.close();

  dom = await loadPage("/pedido.html");
  await sleep(250);
  ok(isShown(dom, $(dom, "#orderEmpty")) && !isShown(dom, $(dom, "#orderForm")) && !isShown(dom, $(dom, "#orderSummary")), "pedido sin producto: solo se ve el aviso");
  dom.window.close();

  dom = await loadPage("/producto.html?id=dior-sauvage-edt");
  await waitFor(() => !$(dom, "#productInfo").hidden);
  ok(isShown(dom, $(dom, "#productLayout")) && isShown(dom, $(dom, "#productInfo")) && !isShown(dom, $(dom, "#productEmpty")), "ficha válida: se ve la ficha y no el aviso");
  dom.window.close();
  dom = await loadPage("/producto.html?id=no-existe");
  await sleep(250);
  ok(!isShown(dom, $(dom, "#productLayout")) && isShown(dom, $(dom, "#productEmpty")), "ficha inexistente: solo se ve el aviso");
  dom.window.close();

  dom = await loadPage("/confirmacion.html?cancelado=1&order=X");
  await sleep(200);
  const panels = ["#confirmLoading", "#confirmApproved", "#confirmRejected", "#confirmCancelled", "#confirmError"].filter((sel) => isShown(dom, $(dom, sel)));
  ok(panels.length === 1 && panels[0] === "#confirmCancelled", "confirmación: se ve un solo panel -> " + panels.join(","));
  dom.window.close();

  dom = await loadPage("/index.html");
  ok(!isShown(dom, $(dom, "#finderResult")) && !isShown(dom, $(dom, "#finderReset")) && !isShown(dom, $(dom, "#filtersEmpty")), "portada: no se ven resultados, 'volver a empezar' ni 'sin fragancias' al inicio");
  ok(!isShown(dom, $(dom, "#cartBadge")), "el contador del carrito está oculto cuando está en 0");
  dom.window.close();

  /* ---------------- 10) textos y estilos que no deben romperse en silencio ---------------- */
  console.log("\n[10] consistencia: HTML en español = diccionario, y regla global de [hidden]");
  {
    const scriptSrc = fs.readFileSync(path.join(ROOT, "public/script.js"), "utf8");
    const I18N = new Function(scriptSrc.slice(scriptSrc.indexOf("var I18N = {"), scriptSrc.indexOf("\n  function t(key)")) + "; return I18N;")();
    const norm = (x) => String(x).replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ").replace(/<!--.*?-->/g, "").replace(/\s+/g, " ").trim();
    const mismatches = [];
    for (const page of ["index", "pedido", "confirmacion", "producto", "carrito"]) {
      const d = new JSDOM(fs.readFileSync(path.join(ROOT, `public/${page}.html`), "utf8")).window.document;
      const cmp = (key, actual) => { const exp = I18N.es[key]; if (exp !== undefined && norm(actual) !== norm(exp)) mismatches.push(`${page}.html [${key}]`); };
      d.querySelectorAll("[data-i18n]").forEach((el) => { const k = el.getAttribute("data-i18n"); cmp(k, (I18N.es[k] || "").indexOf("<") !== -1 ? el.innerHTML : el.textContent); });
      d.querySelectorAll("[data-i18n-placeholder]").forEach((el) => cmp(el.getAttribute("data-i18n-placeholder"), el.getAttribute("placeholder") || ""));
      d.querySelectorAll("[data-i18n-aria]").forEach((el) => cmp(el.getAttribute("data-i18n-aria"), el.getAttribute("aria-label") || ""));
      d.querySelectorAll("[data-i18n-alt]").forEach((el) => cmp(el.getAttribute("data-i18n-alt"), el.getAttribute("alt") || ""));
      d.querySelectorAll("[data-i18n-content]").forEach((el) => cmp(el.getAttribute("data-i18n-content"), el.getAttribute("content") || ""));
    }
    ok(mismatches.length === 0, "el español escrito en cada HTML coincide con el diccionario" + (mismatches.length ? " -> " + mismatches.join(", ") : ""));
    const css = fs.readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
    ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css), "styles.css tiene la regla global [hidden]{display:none!important} (sin ella, un display:flex/grid anula 'hidden' y se ven paneles que deberían estar ocultos)");
  }

  server.close();
  console.log(`\n==== RESULTADO: ${pass} correctas, ${fail} con falla ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERROR DEL TEST:", e); process.exit(2); });

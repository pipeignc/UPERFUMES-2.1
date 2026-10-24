/* =========================================================================
   cart.js — carrito de compras (compartido por todas las páginas)
   -------------------------------------------------------------------------
   - Guarda el carrito en el navegador (localStorage) para que sobreviva al
     pasar de una página a otra. Si el navegador no permite almacenamiento
     (modo privado estricto, por ejemplo) sigue funcionando en memoria
     mientras la página esté abierta.
   - Dibuja el panel que se despliega desde la derecha (junto al HUB) y le
     agrega al HUB el botón del carrito con el contador.
   - Los nombres y precios que muestra salen de GET /api/catalog (el
     catálogo del servidor). Aun así, al pagar el servidor vuelve a
     calcular todo: lo que se vea acá nunca determina cuánto se cobra.
   ========================================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "up_cart_v1";
  var PENDING_KEY = "up_cart_pending_v1";
  var VALID_ML = [3, 5, 10];
  var MAX_QTY = 10;
  var MAX_LINES = 20;

  /* ----------------------------- almacenamiento ------------------------- */
  var memory = {};

  function storeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
  }
  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      memory[key] = value;
    }
  }
  function storeDel(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      delete memory[key];
    }
  }

  /* -------------------------------- estado ------------------------------ */
  function findLine(list, id, ml) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id && list[i].ml === ml) return list[i];
    }
    return null;
  }

  function load() {
    var raw = storeGet(STORAGE_KEY);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      parsed.forEach(function (item) {
        if (!item || typeof item.id !== "string") return;
        var ml = Number(item.ml);
        var qty = Math.floor(Number(item.qty));
        if (VALID_ML.indexOf(ml) === -1 || !(qty >= 1)) return;
        qty = Math.min(qty, MAX_QTY);
        var existing = findLine(out, item.id, ml);
        if (existing) {
          existing.qty = Math.min(existing.qty + qty, MAX_QTY);
        } else {
          out.push({ id: item.id, ml: ml, qty: qty });
        }
      });
      return out.slice(0, MAX_LINES);
    } catch (e) {
      return [];
    }
  }

  var lines = load();
  var listeners = [];

  function save() {
    storeSet(STORAGE_KEY, JSON.stringify(lines));
    changed();
  }

  function changed() {
    render();
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        /* un listener que falla no debe romper al resto */
      }
    });
  }

  function add(id, ml, qty) {
    ml = Number(ml);
    qty = Math.floor(Number(qty || 1));
    if (typeof id !== "string" || !id || VALID_ML.indexOf(ml) === -1 || !(qty >= 1)) return false;
    var existing = findLine(lines, id, ml);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, MAX_QTY);
    } else {
      if (lines.length >= MAX_LINES) return false;
      lines.push({ id: id, ml: ml, qty: Math.min(qty, MAX_QTY) });
    }
    save();
    return true;
  }

  function setQty(id, ml, qty) {
    ml = Number(ml);
    qty = Math.floor(Number(qty));
    var existing = findLine(lines, id, ml);
    if (!existing) return;
    if (!(qty >= 1)) {
      remove(id, ml);
      return;
    }
    existing.qty = Math.min(qty, MAX_QTY);
    save();
  }

  function remove(id, ml) {
    ml = Number(ml);
    lines = lines.filter(function (l) {
      return !(l.id === id && l.ml === ml);
    });
    save();
  }

  function clear() {
    lines = [];
    save();
  }

  function items() {
    return lines.map(function (l) {
      return { id: l.id, ml: l.ml, qty: l.qty };
    });
  }

  function count() {
    return lines.reduce(function (sum, l) {
      return sum + l.qty;
    }, 0);
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  /* El carrito se vacía cuando el pedido que salió de él queda cerrado:
     al confirmar una transferencia, o al volver aprobado desde Webpay. Si el
     pago se rechaza o se cancela, el carrito se conserva para reintentar. */
  function markPendingCheckout(buyOrder) {
    storeSet(PENDING_KEY, String(buyOrder));
  }
  function completeIfMatches(buyOrder) {
    if (storeGet(PENDING_KEY) === String(buyOrder)) {
      storeDel(PENDING_KEY);
      clear();
      return true;
    }
    return false;
  }

  /* ------------------------------- catálogo ----------------------------- */
  var catalogPromise = null;

  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("/api/catalog")
        .then(function (response) {
          if (!response.ok) throw new Error("catalog");
          return response.json();
        })
        .then(function (data) {
          return data.products || {};
        })
        .catch(function () {
          catalogPromise = null; // permite reintentar más tarde
          return {};
        });
    }
    return catalogPromise;
  }

  function getLines() {
    return getCatalog().then(function (catalog) {
      var known = Object.keys(catalog).length > 0;
      var pruned = false;
      var result = [];

      lines.slice().forEach(function (l) {
        var product = catalog[l.id];
        if (known && !product) {
          // Perfume que ya no existe en el catálogo: se saca del carrito.
          lines = lines.filter(function (x) {
            return x !== l;
          });
          pruned = true;
          return;
        }
        var unit = product && product.prices ? product.prices[l.ml] : null;
        var hasPrice = typeof unit === "number";
        result.push({
          id: l.id,
          ml: l.ml,
          qty: l.qty,
          house: product ? product.house : "",
          name: product ? product.name : l.id,
          badge: product ? product.badge : "",
          unitPrice: hasPrice ? unit : null,
          lineTotal: hasPrice ? unit * l.qty : null
        });
      });

      if (pruned) {
        storeSet(STORAGE_KEY, JSON.stringify(lines));
        Promise.resolve().then(changed); // refresca contador y listas con lo que quedó
      }
      return result;
    });
  }

  function sumTotal(resolved) {
    return resolved.reduce(function (sum, l) {
      return sum + (l.lineTotal || 0);
    }, 0);
  }

  /* ------------------------------- utilidades --------------------------- */
  function formatCLP(n) {
    var num = Number(n);
    if (isNaN(num)) return "";
    return "$" + num.toLocaleString("es-CL");
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function tr(key, fallback) {
    var site = window.UPerfumes;
    var value = site && typeof site.t === "function" ? site.t(key) : "";
    return value || fallback || key;
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* HTML de una fila del carrito. Lo usan el panel lateral (variant
     "drawer") y la página del carrito (variant "page"). */
  function rowHTML(line, variant) {
    var link = "producto.html?id=" + encodeURIComponent(line.id);
    var unit = line.unitPrice !== null ? formatCLP(line.unitPrice) : "—";
    var total = line.lineTotal !== null ? formatCLP(line.lineTotal) : "—";
    var attrs = ' data-id="' + esc(line.id) + '" data-ml="' + line.ml + '"';

    return (
      '<li class="cart-line cart-line--' + variant + '">' +
        '<a class="cart-line__thumb" href="' + link + '" tabindex="-1" aria-hidden="true">' +
          '<img src="images/' + esc(line.id) + '.jpg" alt="" loading="lazy">' +
        "</a>" +
        '<div class="cart-line__info">' +
          '<a class="cart-line__name" href="' + link + '">' +
            esc(line.house) + " " + esc(line.name) +
            (line.badge ? ' <span class="badge">' + esc(line.badge) + "</span>" : "") +
          "</a>" +
          '<p class="cart-line__meta">' + line.ml + " ml · " + unit + " " + esc(tr("cart.each", "c/u")) + "</p>" +
          '<div class="cart-line__controls">' +
            '<div class="qty" role="group" aria-label="' + esc(tr("cart.qty", "Cantidad")) + '">' +
              '<button type="button" data-cart-action="dec"' + attrs +
                ' aria-label="' + esc(tr("cart.dec", "Disminuir cantidad")) + '"' +
                (line.qty <= 1 ? " disabled" : "") + ">−</button>" +
              '<span class="qty__value">' + line.qty + "</span>" +
              '<button type="button" data-cart-action="inc"' + attrs +
                ' aria-label="' + esc(tr("cart.inc", "Aumentar cantidad")) + '"' +
                (line.qty >= MAX_QTY ? " disabled" : "") + ">+</button>" +
            "</div>" +
            '<button type="button" class="cart-line__remove" data-cart-action="remove"' + attrs + ">" +
              esc(tr("cart.remove", "Quitar")) +
            "</button>" +
          "</div>" +
        "</div>" +
        '<p class="cart-line__total">' + total + "</p>" +
      "</li>"
    );
  }

  /* ------------------------------ interfaz ------------------------------ */
  var renderSeq = 0;
  var lastFocus = null;

  function isOpen() {
    var drawer = el("cartDrawer");
    return !!drawer && drawer.classList.contains("is-open");
  }

  function updateBadge() {
    var badge = el("cartBadge");
    var toggle = el("cartToggle");
    var n = count();
    if (badge) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n === 0;
    }
    if (toggle) {
      toggle.setAttribute("aria-label", tr("cart.open", "Abrir carrito") + (n ? " (" + n + ")" : ""));
    }
  }

  function render() {
    updateBadge();

    var body = el("cartDrawerBody");
    var drawer = el("cartDrawer");
    if (!body || !drawer) return;

    var countLabel = el("cartCountLabel");
    var n = count();
    if (countLabel) countLabel.textContent = n ? "(" + n + ")" : "";

    if (lines.length === 0) {
      drawer.classList.add("is-empty");
      body.innerHTML =
        '<div class="cart-empty"><p>' + esc(tr("cart.empty", "Tu carrito está vacío.")) + "</p>" +
        '<a class="cart-btn cart-btn--ghost" href="index.html#coleccion" data-cart-action="close">' +
        esc(tr("cart.emptyCta", "Ver la colección")) + "</a></div>";
      var emptySubtotal = el("cartDrawerSubtotal");
      if (emptySubtotal) emptySubtotal.textContent = formatCLP(0);
      return;
    }

    drawer.classList.remove("is-empty");
    var seq = ++renderSeq;

    getLines().then(function (resolved) {
      if (seq !== renderSeq) return; // llegó una actualización más nueva
      body.innerHTML =
        '<ul class="cart-lines">' +
        resolved.map(function (line) { return rowHTML(line, "drawer"); }).join("") +
        "</ul>";
      var subtotal = el("cartDrawerSubtotal");
      if (subtotal) subtotal.textContent = formatCLP(sumTotal(resolved));
      if (!resolved.length) render(); // se podaron productos inexistentes
    });
  }

  function open() {
    var drawer = el("cartDrawer");
    if (!drawer) return;
    lastFocus = document.activeElement;
    render();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    var scrim = el("cartScrim");
    if (scrim) scrim.classList.add("is-open");
    document.body.classList.add("cart-open");
    var toggle = el("cartToggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    var closeBtn = el("cartClose");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    var drawer = el("cartDrawer");
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    var scrim = el("cartScrim");
    if (scrim) scrim.classList.remove("is-open");
    document.body.classList.remove("cart-open");
    var toggle = el("cartToggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function injectUI() {
    if (el("cartDrawer")) return;

    var holder = document.createElement("div");
    holder.innerHTML =
      '<div class="cart-scrim" id="cartScrim" data-cart-action="close"></div>' +
      '<aside class="cart-drawer is-empty" id="cartDrawer" role="dialog" aria-labelledby="cartTitle" aria-hidden="true">' +
        '<header class="cart-drawer__head">' +
          '<h2 class="cart-drawer__title" id="cartTitle"><span data-i18n="cart.title">Tu carrito</span> <span class="cart-drawer__count" id="cartCountLabel"></span></h2>' +
          '<button type="button" class="cart-drawer__close" id="cartClose" data-cart-action="close" data-i18n-aria="cart.close" aria-label="Cerrar carrito">' +
            '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          "</button>" +
        "</header>" +
        '<div class="cart-drawer__body" id="cartDrawerBody"></div>' +
        '<footer class="cart-drawer__foot">' +
          '<div class="cart-drawer__subtotal"><span data-i18n="cart.subtotal">Subtotal</span><strong id="cartDrawerSubtotal">$0</strong></div>' +
          '<a href="carrito.html" class="cart-btn cart-btn--primary" data-i18n="cart.goToCart">Ir a carrito</a>' +
        "</footer>" +
      "</aside>";
    while (holder.firstChild) document.body.appendChild(holder.firstChild);

    // Botón del carrito dentro del HUB, justo al lado del panel.
    var hub = el("pageHub");
    if (hub && !el("cartToggle")) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "hub-cart";
      button.id = "cartToggle";
      button.setAttribute("data-cart-action", "toggle");
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "cartDrawer");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
          '<path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
        "</svg>" +
        '<span class="hub-cart__badge" id="cartBadge" hidden>0</span>';

      var divider = document.createElement("div");
      divider.className = "hub-divider";
      divider.setAttribute("aria-hidden", "true");

      hub.insertBefore(divider, hub.firstChild);
      hub.insertBefore(button, hub.firstChild);
    }
  }

  function init() {
    injectUI();

    document.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-cart-action]") : null;
      if (!target) return;
      var action = target.getAttribute("data-cart-action");
      var id = target.getAttribute("data-id");
      var ml = Number(target.getAttribute("data-ml"));

      if (action === "toggle") {
        if (isOpen()) close();
        else open();
      } else if (action === "close") {
        close();
      } else if (action === "inc" || action === "dec") {
        var current = findLine(lines, id, ml);
        if (current) setQty(id, ml, current.qty + (action === "inc" ? 1 : -1));
      } else if (action === "remove") {
        remove(id, ml);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen()) close();
    });

    // Fotos que no existen todavía: se ocultan en vez de mostrar el ícono roto.
    document.addEventListener(
      "error",
      function (event) {
        var img = event.target;
        if (img && img.tagName === "IMG" && img.closest && img.closest(".cart-line__thumb")) {
          img.classList.add("img-missing");
        }
      },
      true
    );

    // Si el idioma cambia, se vuelve a dibujar con los textos nuevos.
    document.addEventListener("uperfumes:languagechange", function () {
      render();
    });

    // Cambios hechos desde otra pestaña.
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY) {
        lines = load();
        changed();
      }
    });

    render();
  }

  window.UPCart = {
    MAX_QTY: MAX_QTY,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    items: items,
    count: count,
    getLines: getLines,
    getCatalog: getCatalog,
    total: function () {
      return getLines().then(sumTotal);
    },
    rowHTML: rowHTML,
    formatCLP: formatCLP,
    open: open,
    close: close,
    onChange: onChange,
    markPendingCheckout: markPendingCheckout,
    completeIfMatches: completeIfMatches
  };

  if (document.readyState === "loading" && !document.body) {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

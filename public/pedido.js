/* =========================================================================
   pedido.js — "Comprar ahora" (pedido.html?id=...&ml=...&qty=...)
   Arma el resumen del producto y le indica a checkout.js qué se compra.
   ========================================================================= */
(function () {
  "use strict";

  var VALID_ML = [3, 5, 10];
  var MAX_QTY = 10;

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id") || "";
  var ml = Number(params.get("ml"));
  var qty = Math.floor(Number(params.get("qty") || 1));
  if (!(qty >= 1)) qty = 1;
  if (qty > MAX_QTY) qty = MAX_QTY;

  var valid = /^[a-z0-9-]+$/.test(id) && VALID_ML.indexOf(ml) !== -1;

  function el(elId) {
    return document.getElementById(elId);
  }

  function formatCLP(n) {
    return "$" + Number(n).toLocaleString("es-CL");
  }

  // La foto se fija ya, antes de que script.js revise qué imágenes faltan
  // (si el archivo no existe, script.js muestra el marcador punteado).
  var img = el("orderImage");
  if (valid && img) {
    img.src = "images/" + id + ".jpg";
    var code = el("orderImageCode");
    if (code) code.textContent = "images/" + id + ".jpg";
  }

  function showEmpty() {
    el("orderEmpty").hidden = false;
    el("orderSummary").hidden = true;
    el("orderForm").hidden = true;
  }

  // Lo que se cobra: este único producto (el servidor calcula el monto).
  window.UPCheckout.setItemsProvider(function () {
    return valid ? [{ perfumeId: id, ml: ml, qty: qty }] : [];
  });

  document.addEventListener("DOMContentLoaded", function () {
    if (!valid) {
      showEmpty();
      return;
    }

    window.UPCart.getCatalog().then(function (catalog) {
      var product = catalog[id];
      if (!product) {
        showEmpty();
        return;
      }

      var unit = product.prices[ml];
      img.alt = (window.UPerfumes ? window.UPerfumes.t("bottleAlt") : "Frasco de ") + product.house + " " + product.name;
      el("orderHouse").textContent = product.house;
      el("orderName").innerHTML =
        product.name + (product.badge ? ' <span class="badge">' + product.badge + "</span>" : "");
      el("orderPrice").innerHTML =
        ml + " ml" + (qty > 1 ? " × " + qty : "") + " — <strong>" + formatCLP(unit * qty) + "</strong>";

      el("orderSummary").hidden = false;
      el("orderForm").hidden = false;
    });
  });
})();

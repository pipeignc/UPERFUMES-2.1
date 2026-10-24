/* =========================================================================
   producto.js — ficha de producto (producto.html?id=...)
   ========================================================================= */
(function () {
  "use strict";

  var VALID_ML = [3, 5, 10];
  var MAX_QTY = 10;

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id") || "";
  var validId = /^[a-z0-9-]+$/.test(id);

  var selectedMl = Number(params.get("ml"));
  if (VALID_ML.indexOf(selectedMl) === -1) selectedMl = 3;
  var qty = 1;
  var product = null;

  function el(elId) {
    return document.getElementById(elId);
  }

  function site() {
    return window.UPerfumes || null;
  }

  function tr(key, fallback) {
    var s = site();
    var value = s && s.t ? s.t(key) : "";
    return value || fallback || key;
  }

  function formatCLP(n) {
    return "$" + Number(n).toLocaleString("es-CL");
  }

  // La foto se fija ya, antes de que script.js revise qué imágenes faltan
  // (si no existe el archivo, script.js muestra el marcador punteado).
  var img = el("productImage");
  if (validId && img) {
    img.src = "images/" + id + ".jpg";
    var code = el("productImageCode");
    if (code) code.textContent = "images/" + id + ".jpg";
  }

  function metaFor(perfumeId) {
    var s = site();
    if (!s || !s.PERFUMES) return null;
    return s.PERFUMES.filter(function (p) {
      return p.id === perfumeId;
    })[0] || null;
  }

  function renderFormats() {
    var wrap = el("productFormats");
    wrap.innerHTML = VALID_ML.map(function (ml) {
      var checked = ml === selectedMl;
      return (
        '<label class="format-option' + (checked ? " is-checked" : "") + '">' +
          '<input type="radio" name="ml" value="' + ml + '"' + (checked ? " checked" : "") + ">" +
          '<span class="format-option__ml">' + ml + " ml</span>" +
          '<span class="format-option__price">' + formatCLP(product.prices[ml]) + "</span>" +
        "</label>"
      );
    }).join("");
  }

  function updateTotals() {
    el("productTotal").textContent = formatCLP(product.prices[selectedMl] * qty);
    el("productQtyValue").textContent = String(qty);
    el("productQtyDec").disabled = qty <= 1;
    el("productQtyInc").disabled = qty >= MAX_QTY;
    el("productBuyNow").href =
      "pedido.html?id=" + encodeURIComponent(id) + "&ml=" + selectedMl + "&qty=" + qty;

    document.querySelectorAll("#productFormats .format-option").forEach(function (label) {
      var input = label.querySelector("input");
      label.classList.toggle("is-checked", !!(input && input.checked));
    });
  }

  // Todo lo que depende del idioma (descripción, notas, texto alternativo).
  function renderLocalized() {
    if (!product) return;
    el("productHouse").textContent = product.house;
    el("productTitle").innerHTML =
      product.name + (product.badge ? ' <span class="badge">' + product.badge + "</span>" : "");
    document.title = product.house + " " + product.name + " — UPerfumes";
    if (img) img.setAttribute("alt", tr("bottleAlt", "Frasco de ") + product.house + " " + product.name);

    var meta = metaFor(id);
    var s = site();
    if (meta && s && s.pf) {
      var f = s.pf(meta);
      el("productFamily").textContent = f.family;
      el("productDesc").textContent = f.desc;
      el("productNotes").innerHTML =
        "<strong>" + tr("collection.notesTop") + "</strong> " + f.notes.top +
        " · <strong>" + tr("collection.notesHeart") + "</strong> " + f.notes.heart +
        " · <strong>" + tr("collection.notesBase") + "</strong> " + f.notes.base;
    }
  }

  function showNotFound() {
    el("productLayout").hidden = true;
    el("productEmpty").hidden = false;
  }

  function init() {
    if (!validId) {
      showNotFound();
      return;
    }

    window.UPCart.getCatalog().then(function (catalog) {
      product = catalog[id] || null;
      if (!product) {
        showNotFound();
        return;
      }

      renderFormats();
      renderLocalized();
      updateTotals();
      el("productInfo").hidden = false;

      el("productFormats").addEventListener("change", function (event) {
        var value = Number(event.target.value);
        if (VALID_ML.indexOf(value) !== -1) {
          selectedMl = value;
          updateTotals();
        }
      });

      el("productQtyDec").addEventListener("click", function () {
        if (qty > 1) {
          qty -= 1;
          updateTotals();
        }
      });
      el("productQtyInc").addEventListener("click", function () {
        if (qty < MAX_QTY) {
          qty += 1;
          updateTotals();
        }
      });

      el("productAddCart").addEventListener("click", function () {
        if (window.UPCart.add(id, selectedMl, qty)) window.UPCart.open();
      });
    });
  }

  document.addEventListener("uperfumes:languagechange", renderLocalized);
  document.addEventListener("DOMContentLoaded", init);
})();

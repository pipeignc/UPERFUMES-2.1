/* =========================================================================
   carrito.js — página del carrito (carrito.html)
   Lista el contenido del carrito, muestra el total y conecta el pago.
   ========================================================================= */
(function () {
  "use strict";

  var finished = false; // true cuando el pedido ya se cerró (transferencia)

  function el(id) {
    return document.getElementById(id);
  }

  function render() {
    if (finished) return;

    var empty = el("cartPageEmpty");
    var content = el("cartPageContent");

    if (window.UPCart.count() === 0) {
      empty.hidden = false;
      content.hidden = true;
      return;
    }

    window.UPCart.getLines().then(function (lines) {
      if (finished) return;
      if (!lines.length) {
        empty.hidden = false;
        content.hidden = true;
        return;
      }
      empty.hidden = true;
      content.hidden = false;

      el("cartPageList").innerHTML = lines
        .map(function (line) {
          return window.UPCart.rowHTML(line, "page");
        })
        .join("");

      var total = lines.reduce(function (sum, l) {
        return sum + (l.lineTotal || 0);
      }, 0);
      el("cartPageTotal").textContent = window.UPCart.formatCLP(total);
    });
  }

  // Lo que se cobra: las líneas del carrito (solo id, formato y cantidad).
  window.UPCheckout.setItemsProvider(function () {
    return window.UPCart.items().map(function (item) {
      return { perfumeId: item.id, ml: item.ml, qty: item.qty };
    });
  });

  window.UPCheckout.setHooks({
    // Webpay: el carrito se vacía recién cuando el pago vuelve aprobado.
    onWebpayStart: function (buyOrder) {
      window.UPCart.markPendingCheckout(buyOrder);
    },
    // Transferencia: el pedido ya quedó guardado, así que el carrito se vacía.
    onTransferDone: function () {
      finished = true;
      el("cartPageContent").hidden = true;
      window.UPCart.clear();
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    window.UPCart.onChange(render);
    render();
  });
  document.addEventListener("uperfumes:languagechange", render);
})();

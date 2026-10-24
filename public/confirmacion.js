(function () {
  "use strict";

  function formatCLP(n) {
    var num = Number(n);
    if (isNaN(num)) return "";
    return "$" + num.toLocaleString("es-CL");
  }

  function show(id) {
    ["confirmLoading", "confirmApproved", "confirmRejected", "confirmCancelled", "confirmError"].forEach(
      function (elId) {
        var el = document.getElementById(elId);
        if (el) el.hidden = elId !== id;
      }
    );
  }

  var params = new URLSearchParams(window.location.search);
  var buyOrder = params.get("order");

  if (params.get("error") === "1" || !buyOrder) {
    show("confirmError");
    return;
  }

  if (params.get("cancelado") === "1") {
    show("confirmCancelled");
    return;
  }

  fetch("/api/orders/" + encodeURIComponent(buyOrder))
    .then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function (result) {
      if (!result.ok || !result.data.ok) {
        show("confirmError");
        return;
      }

      var order = result.data.order;

      if (order.status === "approved") {
        document.getElementById("apBuyOrder").textContent = order.buyOrder;

        var list = document.getElementById("apItems");
        list.innerHTML = "";
        order.items.forEach(function (item) {
          var li = document.createElement("li");
          li.textContent =
            item.house + " " + item.name + (item.badge ? " (" + item.badge + ")" : "") +
            " — " + item.ml + " ml × " + item.qty + " · " + formatCLP(item.lineTotal);
          list.appendChild(li);
        });

        document.getElementById("apAmount").textContent = formatCLP(order.amount);
        document.getElementById("apAuthCode").textContent = order.authorizationCode || "—";
        document.getElementById("apCard").textContent = order.cardLast4 ? "•••• " + order.cardLast4 : "—";
        show("confirmApproved");

        // Si este pedido salió del carrito, ahora que está pagado se vacía.
        if (window.UPCart) window.UPCart.completeIfMatches(order.buyOrder);
      } else if (order.status === "cancelled") {
        show("confirmCancelled");
      } else if (order.status === "rejected") {
        show("confirmRejected");
      } else {
        // pending_webpay / pending_transfer u otro estado inesperado en
        // este punto: lo tratamos como error para no mostrar algo que
        // parezca un pago aprobado sin estarlo.
        show("confirmError");
      }
    })
    .catch(function () {
      show("confirmError");
    });
})();

/* =========================================================================
   checkout.js — formulario de pago compartido
   -------------------------------------------------------------------------
   Lo usan pedido.html ("Comprar ahora": un solo producto) y carrito.html
   (todo el carrito). Cada página le dice QUÉ se está comprando con
   UPCheckout.setItemsProvider(), y este archivo se encarga del resto:
   validar el formulario, mandar POST /api/orders, y según el método de pago
     - "webpay"        → redirigir al formulario de pago de Transbank
     - "transferencia" → mostrar los datos para transferir
   El precio nunca viaja: el servidor lo calcula con su propio catálogo.
   ========================================================================= */
(function () {
  "use strict";

  var getItems = function () {
    return [];
  };
  var hooks = {};

  window.UPCheckout = {
    setItemsProvider: function (fn) {
      getItems = fn;
    },
    // hooks opcionales: onWebpayStart(buyOrder), onTransferDone(buyOrder)
    setHooks: function (h) {
      hooks = h || {};
    }
  };

  function tr(key, fallback) {
    var site = window.UPerfumes;
    var value = site && typeof site.t === "function" ? site.t(key) : "";
    return value || fallback || key;
  }

  function formatCLP(n) {
    var num = Number(n);
    if (isNaN(num)) return "";
    return "$" + num.toLocaleString("es-CL");
  }

  function init() {
    var formEl = document.getElementById("orderForm");
    if (!formEl) return;

    var submitBtn = document.getElementById("orderSubmit");
    var errorBox = document.getElementById("orderError");
    var errorGeneric = document.getElementById("orderErrorGeneric");
    var errorNetwork = document.getElementById("orderErrorNetwork");
    var errorEmpty = document.getElementById("orderErrorEmpty");
    var errorCustom = document.getElementById("orderErrorCustom");
    var resultEl = document.getElementById("orderResult");
    var webpayForm = document.getElementById("webpayRedirectForm");
    var quotation = null;
    var quoteSequence = 0;
    var shipping = document.createElement('section');
    shipping.className = 'shipping-summary';
    shipping.innerHTML = '<label>Región de despacho<select id="shippingRegion" required><option value="">Selecciona tu región</option></select></label><p id="shippingTotal" role="status">Selecciona tu región para conocer el total con despacho.</p>';
    submitBtn.before(shipping);
    var region = shipping.querySelector('select');
    var totalText = shipping.querySelector('p');
    submitBtn.disabled = true;
    async function refreshQuote() {
      var sequence = ++quoteSequence;
      quotation = null;
      submitBtn.disabled = true;
      if (!region.value || !getItems().length) { totalText.textContent = 'Selecciona tu región para conocer el total con despacho.'; return; }
      totalText.textContent = 'Calculando total…';
      try {
        var response = await fetch('/api/quote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:getItems(),region:region.value})});
        var data = await response.json();
        if (sequence !== quoteSequence) return;
        if (!response.ok) throw new Error((data.errors || []).join(' '));
        quotation = { ...data, itemsKey:JSON.stringify(getItems()) };
        totalText.textContent = 'Productos: '+formatCLP(data.subtotal)+' · Despacho: '+formatCLP(data.shipping)+' · Total a pagar: '+formatCLP(data.total);
        submitBtn.disabled = false;
      } catch(error) { if(sequence===quoteSequence) totalText.textContent = error.message || 'No pudimos calcular el despacho. Selecciona tu región nuevamente.'; }
    }
    region.addEventListener('change',refreshQuote);
    if(window.UPCart) window.UPCart.onChange(refreshQuote);
    fetch('/api/shipping').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
      Object.entries(data.regions).forEach(([name,fee])=>{var option=document.createElement('option');option.value=name;option.textContent=name+' · '+formatCLP(fee);region.append(option);});
    }).catch(()=>{totalText.textContent='No pudimos cargar las tarifas de despacho. Recarga para reintentar.';});

    function selectedMethod() {
      var radio = document.querySelector('input[name="pago"]:checked');
      return radio ? radio.value : "webpay";
    }

    // El botón dice "Pagar con Webpay" o "Confirmar pedido" según el método.
    function refreshSubmitLabel() {
      var isWebpay = selectedMethod() === "webpay";
      var key = isWebpay ? "order.submit.webpay" : "order.submit";
      submitBtn.setAttribute("data-i18n", key);
      submitBtn.textContent = tr(key, isWebpay ? "Pagar con Webpay" : "Confirmar pedido");
    }

    function highlightRadios() {
      document.querySelectorAll(".order-radio").forEach(function (wrap) {
        var input = wrap.querySelector("input");
        wrap.classList.toggle("is-checked", !!(input && input.checked));
      });
    }

    document.querySelectorAll('.order-radio input[type="radio"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        highlightRadios();
        refreshSubmitLabel();
      });
    });
    highlightRadios();
    refreshSubmitLabel();

    function hideAllErrors() {
      errorBox.hidden = true;
      [errorGeneric, errorNetwork, errorEmpty, errorCustom].forEach(function (p) {
        if (p) p.hidden = true;
      });
      errorCustom.textContent = "";
    }

    function showError(kind, customText) {
      errorBox.hidden = false;
      errorGeneric.hidden = kind !== "generic";
      errorNetwork.hidden = kind !== "network";
      if (errorEmpty) errorEmpty.hidden = kind !== "empty";
      errorCustom.hidden = kind !== "custom";
      if (kind === "custom") errorCustom.textContent = customText || "";
      errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function setBusy(isBusy) {
      submitBtn.disabled = isBusy || !quotation;
      submitBtn.setAttribute("aria-busy", String(isBusy));
    }

    function redirectToWebpay(url, token) {
      webpayForm.action = url;
      webpayForm.querySelector('input[name="token_ws"]').value = token;
      webpayForm.submit(); // Transbank exige llegar a su formulario vía POST.
    }

    function setText(id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value;
    }

    function showTransferResult(data) {
      var transfer = data.transfer;
      setText("resultBuyOrder", data.buyOrder);
      setText("resultAmount", formatCLP(data.order && data.order.amount));
      setText("resultBank", transfer.bank);
      setText("resultAccountType", transfer.accountType);
      setText("resultAccountNumber", transfer.accountNumber);
      setText("resultHolder", transfer.holder);
      setText("resultRut", transfer.rut);
      setText("resultEmail", transfer.email);

      formEl.hidden = true;
      resultEl.hidden = false;
      resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    formEl.addEventListener("submit", function (event) {
      event.preventDefault();
      hideAllErrors();

      var items = getItems();
      if (!items || !items.length) {
        showError("empty");
        return;
      }
      if (typeof formEl.reportValidity === "function" && !formEl.reportValidity()) return;
      if(!quotation || quotation.itemsKey !== JSON.stringify(items)) {
        showError('custom','Revisa el total actualizado antes de pagar.');
        refreshQuote();
        return;
      }

      setBusy(true);

      var payload = {
        items: items,
        region: region.value,
        quotedTotal: quotation.total,
        customerName: document.getElementById("fName").value.trim(),
        customerEmail: document.getElementById("fEmail").value.trim(),
        deliveryAddress: document.getElementById("fAddress").value.trim(),
        notes: document.getElementById("fNotes").value.trim(),
        paymentMethod: selectedMethod()
      };

      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.data.ok) {
            var messages = (result.data && result.data.errors) || [];
            if (messages.length) showError("custom", messages.join(" "));
            else showError("generic");
            setBusy(false);
            refreshQuote();
            return;
          }

          if (result.data.mode === "webpay") {
            if (hooks.onWebpayStart) hooks.onWebpayStart(result.data.buyOrder);
            redirectToWebpay(result.data.url, result.data.token);
            // La página está a punto de navegar a Transbank: no se reactiva el botón.
          } else {
            showTransferResult(result.data);
            if (hooks.onTransferDone) hooks.onTransferDone(result.data.buyOrder);
            setBusy(false);
          }
        })
        .catch(function () {
          showError("network");
          setBusy(false);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

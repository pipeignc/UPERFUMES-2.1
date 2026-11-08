const express = require("express");
const { createOrderRules, handleValidation, MAX_QTY } = require("../middleware/validateOrder");
const { getProduct, getPrice, listCatalog } = require("../data/catalog");
const ordersService = require("../services/orders");
const webpayService = require("../services/webpay");
const { generateBuyOrder, generateSessionId } = require("../utils/ids");

const router = express.Router();
const shop = require('../services/shop');
const { CATALOG } = require('../data/catalog');

// Datos informativos de la transferencia manual. Son de ejemplo — cámbialos
// por los reales del negocio antes de usar esto en producción.
const TRANSFER_DETAILS = {
  bank: "BancoEstado",
  accountType: "Cuenta RUT",
  accountNumber: "11.111.111-1",
  holder: "UPerfumes SpA",
  rut: "11.111.111-1",
  email: "hola@uperfumes.com"
};

/**
 * Catálogo público (nombres y precios). El navegador lo usa para dibujar el
 * carrito y las fichas de producto; el cobro, en cambio, siempre recalcula
 * desde el catálogo del servidor.
 */
router.get("/catalog", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, products: listCatalog(), packs: shop.packs(CATALOG) });
});

router.get('/shipping', (req, res) => res.json({ regions: shop.settings().shippingRegions }));
router.post('/quote', (req, res) => {
  try { res.json({ok:true, ...shop.quote(req.body.items, req.body.region, getProduct)}); }
  catch (error) { res.status(400).json({ok:false, errors:[error.message]}); }
});

router.post("/orders", createOrderRules, handleValidation, async (req, res, next) => {
  try {
    const { items, customerName, customerEmail, deliveryAddress, notes, paymentMethod } = req.body;
    let quotation;
    try { quotation = shop.quote(items, req.body.region, getProduct); }
    catch (error) { return res.status(400).json({ ok:false, errors:[error.message] }); }
    if (req.body.quotedTotal !== quotation.total) return res.status(409).json({ ok:false, errors:['El total cambió. Revisa el resumen antes de pagar.'] });

    // Si llega el mismo perfume+formato en dos líneas, se suman en una sola.
    const merged = new Map();
    for (const item of items) {
      const key = `${item.perfumeId}|${item.ml}`;
      const previous = merged.get(key);
      merged.set(key, {
        perfumeId: item.perfumeId,
        ml: item.ml,
        qty: (previous ? previous.qty : 0) + item.qty
      });
    }

    let amount = 0;
    const orderItems = [];
    for (const item of merged.values()) {
      const product = getProduct(item.perfumeId);
      const unitPrice = getPrice(item.perfumeId, item.ml);
      // La validación ya garantiza esto, pero se revisa de nuevo acá:
      // el monto que se cobra se calcula SOLO con datos del servidor.
      if (!product || unitPrice === null || item.qty > MAX_QTY) {
        return res.status(400).json({ ok: false, errors: ["Perfume, formato o cantidad no válidos."] });
      }
      amount += unitPrice * item.qty;
      orderItems.push({
        perfumeId: item.perfumeId,
        house: product.house,
        name: product.items ? product.name + ' (' + product.items.map(i => i.name + ' · ' + i.ml + ' ml').join(', ') + ')' : product.name,
        badge: product.badge || "",
        ml: item.ml,
        qty: item.qty,
        unitPrice
      });
    }

    const buyOrder = generateBuyOrder();
    amount = quotation.total;
    const sessionId = generateSessionId();

    const order = ordersService.createOrder(
      {
        buyOrder,
        sessionId,
        amount,
        shippingAmount: quotation.shipping,
        shippingRegion: quotation.region,
        customerName,
        customerEmail,
        deliveryAddress,
        notes: notes || "",
        paymentMethod,
        status: paymentMethod === "webpay" ? "pending_webpay" : "pending_transfer"
      },
      orderItems
    );

    if (paymentMethod === "webpay") {
      const baseUrl = process.env.PUBLIC_BASE_URL;

      if(!baseUrl) {
        throw new Error("PUBLIC_BASE_URL no está configurada en .env");
      }

      const returnUrl = new URL(
        "/webpay/retorno",
        baseUrl
      ).toString();
      
      console.log("URL de retorno Webpay:", returnUrl);
      let webpayResponse;
      try {
        webpayResponse = await webpayService.createTransaction({
          buyOrder,
          sessionId,
          amount,
          returnUrl
        });
      } catch (err) {
        // Transbank no respondió: el pedido no puede quedar "pendiente" para
        // siempre esperando un pago que nunca va a ocurrir.
        ordersService.setStatus(buyOrder, "failed");
        console.error("ERROR WEBPAY:");
        console.error("Mensaje:", err.message);
        console.error("Código HTTP:", err.status || err.statusCode);
        console.error("Respuesta:", err.response?.data || err.response?.body);
        throw err;
      }

      ordersService.setWebpayToken(buyOrder, webpayResponse.token);

      return res.status(201).json({
        ok: true,
        mode: "webpay",
        buyOrder,
        amount,
        token: webpayResponse.token,
        url: webpayResponse.url
      });
    }

    return res.status(201).json({
      ok: true,
      mode: "transferencia",
      buyOrder,
      order: ordersService.toPublicJSON(order),
      transfer: TRANSFER_DETAILS
    });
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:buyOrder", (req, res) => {
  const order = ordersService.getByBuyOrder(req.params.buyOrder);
  if (!order) {
    return res.status(404).json({ ok: false, errors: ["Pedido no encontrado."] });
  }
  return res.json({ ok: true, order: ordersService.toPublicJSON(order) });
});

module.exports = router;

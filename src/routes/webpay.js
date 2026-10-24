const express = require("express");
const ordersService = require("../services/orders");
const webpayService = require("../services/webpay");

const router = express.Router();

/**
 * URL de retorno que se le entrega a Transbank al crear la transacción.
 * Transbank llama acá de dos maneras distintas (hay que soportar ambas):
 *
 *   - GET  con  ?token_ws=...         → la persona SÍ terminó de pagar
 *     (aprobado o rechazado, eso lo dice el commit, no el método HTTP).
 *   - POST con  TBK_TOKEN / TBK_ID_SESION / TBK_ORDEN_COMPRA (sin token_ws)
 *     → la persona volvió sin terminar de ingresar la tarjeta (se arrepintió
 *     o se le acabó el tiempo). NO hay que hacer commit en este caso: la
 *     transacción no quedó en un estado que se pueda confirmar, y Transbank
 *     devuelve error si se intenta.
 *
 * Si token_ws llega junto con los TBK_*, token_ws manda.
 */
async function handleReturn(req, res) {
  const tokenWs = req.query.token_ws || req.body.token_ws;

  if (tokenWs) {
    return handleCommit(tokenWs, res);
  }

  const abortedBuyOrder = req.query.TBK_ORDEN_COMPRA || req.body.TBK_ORDEN_COMPRA;
  if (abortedBuyOrder) {
    const order = ordersService.getByBuyOrder(abortedBuyOrder);
    if (order) {
      ordersService.setStatus(abortedBuyOrder, "cancelled");
    }
    return res.redirect(`/confirmacion.html?order=${encodeURIComponent(abortedBuyOrder)}&cancelado=1`);
  }

  // Ni token_ws ni TBK_ORDEN_COMPRA: no debería pasar en un flujo normal.
  return res.redirect("/confirmacion.html?error=1");
}

async function handleCommit(token, res) {
  // Si la persona recarga esta página (o Transbank reintenta la llamada), el
  // pedido ya quedó resuelto: confirmar de nuevo daría error. Se muestra el
  // resultado que ya está guardado.
  const alreadyResolved = ordersService.getByWebpayToken(token);
  if (alreadyResolved && ["approved", "rejected"].includes(alreadyResolved.status)) {
    return res.redirect(`/confirmacion.html?order=${encodeURIComponent(alreadyResolved.buy_order)}`);
  }

  let commitResponse;
  try {
    commitResponse = await webpayService.commitTransaction(token);
  } catch (err) {
    console.error("Error al confirmar transacción Webpay:", err.message);
    return res.redirect("/confirmacion.html?error=1");
  }

  const buyOrder = commitResponse.buy_order;
  const order = ordersService.getByBuyOrder(buyOrder);
  let approved = webpayService.isApproved(commitResponse);

  // Defensa extra: el monto que Transbank cobró debe ser exactamente el del
  // pedido guardado. Si no coincide, no se da por aprobado.
  if (approved && order && commitResponse.amount !== order.amount) {
    console.error(
      `Monto distinto en ${buyOrder}: pedido=${order.amount}, Transbank=${commitResponse.amount}`
    );
    ordersService.setStatus(buyOrder, "amount_mismatch");
    return res.redirect("/confirmacion.html?error=1");
  }

  const cardDetail = commitResponse.card_detail || {};

  ordersService.setWebpayResult(buyOrder, {
    status: approved ? "approved" : "rejected",
    authorizationCode: commitResponse.authorization_code,
    responseCode: commitResponse.response_code,
    cardLast4: cardDetail.card_number,
    transactionDate: commitResponse.transaction_date,
    rawResponse: commitResponse
  });

  return res.redirect(`/confirmacion.html?order=${encodeURIComponent(buyOrder)}`);
}

router.get("/retorno", handleReturn);
router.post("/retorno", handleReturn);

module.exports = router;

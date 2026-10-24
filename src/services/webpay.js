const {
  WebpayPlus,
  Options,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Environment
} = require("transbank-sdk");

/**
 * Desde la versión 3 del SDK, Transbank dejó de apuntar al ambiente de
 * integración por defecto: hay que configurarlo explícitamente acá. Por
 * eso este archivo arma sus propias Options en vez de confiar en valores
 * por omisión del SDK.
 */
function buildOptions() {
  return new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration
  );
}

function getTransaction() {
  return new WebpayPlus.Transaction(buildOptions());
}

/**
 * Crea una transacción Webpay Plus.
 * @returns {Promise<{token: string, url: string}>}
 */
async function createTransaction({ buyOrder, sessionId, amount, returnUrl }) {
  const tx = getTransaction();
  return tx.create(buyOrder, sessionId, amount, returnUrl);
}

/**
 * Confirma (commit) una transacción ya creada, usando el token que
 * Transbank devuelve al volver del formulario de pago.
 * @returns {Promise<object>} la respuesta completa de Transbank
 */
async function commitTransaction(token) {
  const tx = getTransaction();
  return tx.commit(token);
}

/**
 * true si el commit indica un pago aprobado. Transbank documenta que hay
 * que revisar status Y response_code juntos, no uno solo.
 */
function isApproved(commitResponse) {
  return (
    !!commitResponse &&
    commitResponse.status === "AUTHORIZED" &&
    commitResponse.response_code === 0
  );
}

module.exports = { createTransaction, commitTransaction, isApproved };

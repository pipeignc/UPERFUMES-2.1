const crypto = require("crypto");

/**
 * Transbank exige que buyOrder tenga a lo más 26 caracteres alfanuméricos.
 * "UP" + timestamp en base36 + 4 caracteres al azar queda muy por debajo
 * de ese límite y es prácticamente único.
 */
function generateBuyOrder() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `UP${timestamp}${random}`.slice(0, 26);
}

/** sessionId admite hasta 61 caracteres; un UUID (36) sobra de margen. */
function generateSessionId() {
  return crypto.randomUUID();
}

module.exports = { generateBuyOrder, generateSessionId };

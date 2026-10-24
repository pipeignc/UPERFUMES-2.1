const db = require("../db");

const insertOrderStmt = db.prepare(`
  INSERT INTO orders (
    buy_order, session_id, amount,
    customer_name, customer_email, delivery_address, notes,
    payment_method, status
  ) VALUES (
    @buyOrder, @sessionId, @amount,
    @customerName, @customerEmail, @deliveryAddress, @notes,
    @paymentMethod, @status
  )
`);

const insertItemStmt = db.prepare(`
  INSERT INTO order_items (order_id, perfume_id, house, name, badge, ml, qty, unit_price)
  VALUES (@orderId, @perfumeId, @house, @name, @badge, @ml, @qty, @unitPrice)
`);

const getByBuyOrderStmt = db.prepare(`SELECT * FROM orders WHERE buy_order = ?`);
const getByTokenStmt = db.prepare(`SELECT * FROM orders WHERE webpay_token = ?`);
const getItemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`);

const setWebpayTokenStmt = db.prepare(`
  UPDATE orders SET webpay_token = ?, updated_at = datetime('now') WHERE buy_order = ?
`);

const setWebpayResultStmt = db.prepare(`
  UPDATE orders SET
    status = ?,
    webpay_authorization_code = ?,
    webpay_response_code = ?,
    webpay_card_last4 = ?,
    webpay_transaction_date = ?,
    webpay_raw_response = ?,
    updated_at = datetime('now')
  WHERE buy_order = ?
`);

const setStatusStmt = db.prepare(`
  UPDATE orders SET status = ?, updated_at = datetime('now') WHERE buy_order = ?
`);

/** El pedido y todos sus ítems se guardan juntos o no se guarda nada. */
const createOrderTx = db.transaction((order, items) => {
  const info = insertOrderStmt.run(order);
  const orderId = Number(info.lastInsertRowid);
  for (const item of items) {
    insertItemStmt.run({ orderId, ...item });
  }
});

function withItems(row) {
  if (!row) return null;
  row.items = getItemsStmt.all(row.id);
  return row;
}

function createOrder(order, items) {
  createOrderTx(order, items);
  return getByBuyOrder(order.buyOrder);
}

function getByBuyOrder(buyOrder) {
  return withItems(getByBuyOrderStmt.get(buyOrder));
}

function getByWebpayToken(token) {
  return withItems(getByTokenStmt.get(token));
}

function setWebpayToken(buyOrder, token) {
  setWebpayTokenStmt.run(token, buyOrder);
}

function setWebpayResult(buyOrder, result) {
  setWebpayResultStmt.run(
    result.status,
    result.authorizationCode || null,
    typeof result.responseCode === "number" ? result.responseCode : null,
    result.cardLast4 || null,
    result.transactionDate || null,
    result.rawResponse ? JSON.stringify(result.rawResponse) : null,
    buyOrder
  );
}

function setStatus(buyOrder, status) {
  setStatusStmt.run(status, buyOrder);
}

/** Subconjunto seguro para devolver por la API (sin datos internos de Webpay). */
function toPublicJSON(order) {
  if (!order) return null;
  return {
    buyOrder: order.buy_order,
    amount: order.amount,
    items: (order.items || []).map((item) => ({
      perfumeId: item.perfume_id,
      house: item.house,
      name: item.name,
      badge: item.badge,
      ml: item.ml,
      qty: item.qty,
      unitPrice: item.unit_price,
      lineTotal: item.unit_price * item.qty
    })),
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    deliveryAddress: order.delivery_address,
    notes: order.notes,
    paymentMethod: order.payment_method,
    status: order.status,
    authorizationCode: order.webpay_authorization_code,
    cardLast4: order.webpay_card_last4,
    transactionDate: order.webpay_transaction_date,
    createdAt: order.created_at
  };
}

module.exports = {
  createOrder,
  getByBuyOrder,
  getByWebpayToken,
  setWebpayToken,
  setWebpayResult,
  setStatus,
  toPublicJSON
};

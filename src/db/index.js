const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATABASE_PATH = process.env.DATABASE_PATH || "./data/uperfumes.sqlite";
const resolvedPath = path.resolve(process.cwd(), DATABASE_PATH);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buy_order TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    amount INTEGER NOT NULL,

    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    notes TEXT,

    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',

    webpay_token TEXT,
    webpay_authorization_code TEXT,
    webpay_response_code INTEGER,
    webpay_card_last4 TEXT,
    webpay_transaction_date TEXT,
    webpay_raw_response TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    perfume_id TEXT NOT NULL,
    house TEXT NOT NULL,
    name TEXT NOT NULL,
    badge TEXT,
    ml INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    unit_price INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_buy_order ON orders(buy_order);
  CREATE INDEX IF NOT EXISTS idx_orders_webpay_token ON orders(webpay_token);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

/**
 * Migración: la primera versión guardaba UN perfume directamente en la
 * tabla orders (columnas perfume_id, house, name, badge, ml). Con el
 * carrito, cada pedido puede tener varios ítems y esos datos viven en
 * order_items. Si la base ya existía con el esquema viejo, se pasan los
 * pedidos antiguos a order_items (cantidad 1) y se quitan esas columnas.
 * Si la base es nueva, esto no hace nada.
 */
function migrateLegacyOrders() {
  const columns = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!columns.includes("perfume_id")) return;

  const migrate = db.transaction(() => {
    db.exec(`
      INSERT INTO order_items (order_id, perfume_id, house, name, badge, ml, qty, unit_price)
      SELECT id, perfume_id, house, name, badge, ml, 1, amount FROM orders
    `);
    for (const col of ["perfume_id", "house", "name", "badge", "ml"]) {
      db.exec(`ALTER TABLE orders DROP COLUMN ${col}`);
    }
  });
  migrate();
}

migrateLegacyOrders();

module.exports = db;

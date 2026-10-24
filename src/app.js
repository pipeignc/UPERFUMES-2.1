const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const ordersRouter = require("./routes/orders");
const webpayRouter = require("./routes/webpay");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Detrás del proxy de un hosting (Railway, Render, Fly.io…) la IP real de
// cada cliente llega en X-Forwarded-For. Sin esto, TODOS los clientes se
// verían con la IP del proxy y el límite de pedidos de más abajo se
// repartiría entre todos en vez de aplicarse a cada persona.
// TRUST_PROXY = cuántos proxies hay delante (1 en la mayoría de los hostings;
// 0 si corres el servidor directo a internet o en tu computador).
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

app.use(
  helmet({
    // El formulario de pago de Transbank se abre en SU propia página (nos
    // redirige fuera del sitio), así que no necesitamos relajar la CSP
    // para incrustar nada de ellos acá.
    contentSecurityPolicy: false
  })
);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"]
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Transbank llama a /webpay/retorno hasta un par de veces en algunos casos
// de reintento; igual conviene no dejar el endpoint de crear pedidos abierto
// a abuso.
const ordersLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api/orders", ordersLimiter);
app.use("/api", ordersRouter);
app.use("/webpay", webpayRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use(errorHandler);

module.exports = app;

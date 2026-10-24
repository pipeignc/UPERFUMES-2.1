const { body, validationResult } = require("express-validator");
const { getPrice } = require("../data/catalog");

const VALID_ML = [3, 5, 10];
const MAX_LINES = 20;
const MAX_QTY = 10;

const createOrderRules = [
  body("items")
    .isArray({ min: 1, max: MAX_LINES })
    .withMessage(`El pedido debe tener entre 1 y ${MAX_LINES} productos.`),
  body("items.*.perfumeId")
    .isString().trim().notEmpty()
    .withMessage("Falta el perfume en uno de los productos."),
  body("items.*.ml")
    .isInt().withMessage("El formato (ml) no es válido.")
    .toInt()
    .custom((value) => VALID_ML.includes(value))
    .withMessage("El formato debe ser 3, 5 o 10 ml."),
  body("items.*.qty")
    .isInt({ min: 1, max: MAX_QTY })
    .withMessage(`La cantidad debe estar entre 1 y ${MAX_QTY}.`)
    .toInt(),
  body("items.*")
    .custom((item) => getPrice(item && item.perfumeId, item && Number(item.ml)) !== null)
    .withMessage("Perfume o formato (ml) no válido."),
  body("customerName")
    .isString().trim().isLength({ min: 2, max: 120 })
    .withMessage("El nombre debe tener entre 2 y 120 caracteres."),
  body("customerEmail")
    .isEmail().withMessage("El correo no es válido.")
    .normalizeEmail(),
  body("deliveryAddress")
    .isString().trim().isLength({ min: 5, max: 400 })
    .withMessage("La dirección debe tener entre 5 y 400 caracteres."),
  body("notes")
    .optional({ checkFalsy: true })
    .isString().trim().isLength({ max: 400 })
    .withMessage("Las notas no pueden superar los 400 caracteres."),
  body("paymentMethod")
    .isIn(["webpay", "transferencia"])
    .withMessage("Método de pago no válido.")
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Mensajes únicos: con varios ítems el mismo error podría repetirse.
    const messages = [...new Set(errors.array().map((e) => e.msg))];
    return res.status(400).json({ ok: false, errors: messages });
  }
  next();
}

module.exports = { createOrderRules, handleValidation, MAX_QTY };

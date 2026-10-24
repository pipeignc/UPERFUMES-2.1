function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({
    ok: false,
    errors: ["Ocurrió un error inesperado en el servidor. Intenta de nuevo en unos minutos."]
  });
}

module.exports = errorHandler;

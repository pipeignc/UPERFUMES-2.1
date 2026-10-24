require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`UPerfumes server escuchando en http://localhost:${PORT}`);
  console.log(`Ambiente Webpay: ${process.env.TRANSBANK_ENVIRONMENT || "integration"}`);
});

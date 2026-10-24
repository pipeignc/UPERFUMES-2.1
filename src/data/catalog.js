/**
 * Catálogo del lado del servidor.
 *
 * El precio que el navegador manda en el pedido NUNCA se usa para cobrar:
 * es solo referencial. El monto real que se le pasa a Webpay sale de ACÁ,
 * buscando por perfumeId + ml. Así, aunque alguien manipule la petición
 * desde el navegador, no puede pagar un precio distinto al real.
 *
 * Mantén esto sincronizado con el arreglo PERFUMES de script.js si cambias
 * precios o agregas/quitas perfumes.
 */
const CATALOG = {
  "dior-sauvage-edt": {
    house: "Dior", name: "Sauvage", badge: "EDT",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "invictus-victory-elixir": {
    house: "Paco Rabanne", name: "Invictus Victory Elixir", badge: "Elixir",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "dior-homme-intense": {
    house: "Dior", name: "Homme Intense", badge: "EDP",
    prices: { 3: 9990, 5: 14990, 10: 26990 }
  },
  "valentino-born-in-roma-extradose": {
    house: "Valentino", name: "Uomo Born in Roma Extradose", badge: "Extradose",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "jpg-le-male-elixir": {
    house: "Jean Paul Gaultier", name: "Le Male Elixir", badge: "Elixir",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "jpg-le-beau-le-parfum": {
    house: "Jean Paul Gaultier", name: "Le Beau Le Parfum", badge: "Le Parfum",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "jpg-le-male-le-parfum": {
    house: "Jean Paul Gaultier", name: "Le Male Le Parfum", badge: "Le Parfum",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "mancera-cedrat-boise": {
    house: "Mancera", name: "Cedrat Boise", badge: "EDP",
    prices: { 3: 6990, 5: 11490, 10: 19990 }
  },
  "mykonos-inception": {
    house: "Mykonos", name: "Inception", badge: "EDP",
    prices: { 3: 3990, 5: 5990, 10: 8990 }
  },
  "azzaro-most-wanted-intense": {
    house: "Azzaro", name: "The Most Wanted Intense", badge: "EDP Intense",
    prices: { 3: 7490, 5: 11990, 10: 20990 }
  },
  "french-avenue-liquid-brun": {
    house: "French Avenue", name: "Liquid Brun", badge: "EDP",
    prices: { 3: 3990, 5: 5990, 10: 8990 }
  }
};

function getProduct(perfumeId) {
  return CATALOG[perfumeId] || null;
}

function getPrice(perfumeId, ml) {
  const product = getProduct(perfumeId);
  if (!product) return null;
  return Object.prototype.hasOwnProperty.call(product.prices, ml) ? product.prices[ml] : null;
}

/** Copia pública del catálogo (id → house, name, badge, prices) para el navegador. */
function listCatalog() {
  const out = {};
  for (const [id, product] of Object.entries(CATALOG)) {
    out[id] = {
      house: product.house,
      name: product.name,
      badge: product.badge,
      prices: { ...product.prices }
    };
  }
  return out;
}

module.exports = { CATALOG, getProduct, getPrice, listCatalog };

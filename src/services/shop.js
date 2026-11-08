const fs = require('node:fs');
const path = require('node:path');
const profiles = require('../data/profiles.json');
const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bjpg\b/g, 'jean paul gaultier').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function settings() {
  return JSON.parse(fs.readFileSync(process.env.COMMERCE_CONFIG_PATH || path.join(__dirname, '../data/commerce.json'), 'utf8'));
}
const packDefinitions = [
  { id: 'pack-frescos', name: 'Frescos para diario', ids: ['dior-sauvage-edt', 'mancera-cedrat-boise', 'jpg-le-beau-le-parfum'] },
  { id: 'pack-dulces', name: 'Dulces para la noche', ids: ['jpg-le-male-elixir', 'invictus-victory-elixir', 'french-avenue-liquid-brun'] }
];
function enrich(id, product) {
  const config = settings();
  const meta = profiles[id] || {};
  const text = normalize(meta.i18n?.es?.desc);
  const profilesList = [];
  if (/fresc|citric|bergamota/.test(text)) profilesList.push('fresco');
  if (/dulce|vainilla|golosa|tonka|coco/.test(text)) profilesList.push('dulce');
  if (/cedro|madera|vetiver/.test(text)) profilesList.push('amaderado');
  const formats = Object.entries(product.prices).map(([ml, price]) => ({ ml: Number(ml), price, available: !(config.unavailableFormats[id] || []).includes(Number(ml)) }));
  return { ...product, id, ...meta, profiles: profilesList, formats, available: formats.some(f => f.available),
    summary: meta.i18n?.es?.desc, intensity: ['Elixir','Extradose','EDP Intense'].includes(product.badge) ? 'Alta (orientativa)' : 'Media a alta (orientativa)',
    decantImage: config.decantImages[id] || null };
}
function packs(catalog) {
  const config = settings();
  const discount = config.packDiscountPercent;
  return packDefinitions.map(pack => {
    const items = pack.ids.map(id => ({ perfumeId: id, ml: 3, qty: 1, name: catalog[id].name, price: catalog[id].prices[3] }));
    const originalPrice = items.reduce((sum, item) => sum + item.price, 0);
    const configured = Number.isFinite(discount) && discount > 0 && discount < 100;
    const price = configured ? Math.round(originalPrice * (100 - discount) / 100) : null;
    return { ...pack, house: 'UPerfumes', badge: '3 muestras de 3 ml', items, originalPrice, price, prices: configured ? {3: price} : {},
      available: configured && items.every(i => enrich(i.perfumeId, catalog[i.perfumeId]).formats.find(f => f.ml === 3).available) };
  });
}
function search(products, { query = '', profile = '', occasion = '', budget = Infinity, stock = false } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  return products.filter(p => words.every(w => normalize(p.house + ' ' + p.name + ' ' + p.badge).includes(w)) &&
    (!profile || p.profiles.includes(profile)) && (!occasion || p.occasions?.includes(occasion)) &&
    (!stock || p.available) && p.formats.some(f => f.price <= budget && (!stock || f.available)));
}
function quote(items, region, getProduct) {
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error('Elige entre 1 y 20 productos.');
  const counts = new Map();
  let subtotal = 0;
  for (const item of items) {
    if (!item || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10 || ![3,5,10].includes(item.ml)) throw new Error('Formato o cantidad no válidos.');
    const p = getProduct(item.perfumeId);
    if (!p || !p.available || !Number.isSafeInteger(p.prices[item.ml])) throw new Error('Producto o pack no disponible.');
    const contents = p.items || [{perfumeId:item.perfumeId, ml:item.ml, qty:1}];
    for (const part of contents) {
      const key = part.perfumeId + ':' + part.ml;
      counts.set(key, (counts.get(key) || 0) + item.qty);
      const actual = getProduct(part.perfumeId);
      if (!actual.formats.find(f => f.ml === part.ml)?.available || counts.get(key) > 10) throw new Error('Formato agotado o máximo de 10 unidades por formato.');
    }
    subtotal += p.prices[item.ml] * item.qty;
  }
  const regions = settings().shippingRegions;
  if (!Object.keys(regions).length) throw new Error('El despacho aún no tiene tarifas confirmadas. Contacta a la tienda antes de pagar.');
  if (!Object.hasOwn(regions, region) || !Number.isSafeInteger(regions[region]) || regions[region] < 0) throw new Error('Selecciona una región de despacho disponible.');
  return { subtotal, shipping: regions[region], region, total: subtotal + regions[region] };
}
module.exports = { enrich, packs, settings, search, normalize, quote };

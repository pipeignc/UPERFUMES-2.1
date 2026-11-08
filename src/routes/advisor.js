const router = require('express').Router();
const { listCatalog } = require('../data/catalog');
const { normalize, search } = require('../services/shop');
const money = n => '$' + n.toLocaleString('es-CL');
const occasionMap = { 'Diario/Casual':'diario', 'Oficina/Trabajo':'oficina', 'Noche/Fiesta':'noche', 'Cita/Romántico':'cita', 'Formal/Evento':'formal' };
function options(product, budget) {
  return product.formats.filter(f => f.available && f.price <= budget).map(f => ({...f, href:`/producto.html?id=${product.id}&ml=${f.ml}`}));
}
function result(product, budget, reason) {
  const formats = options(product, budget);
  const first = formats[0];
  return { id:product.id, name:product.house + ' ' + product.name + ' ' + product.badge, formats,
    price:first.price, ml:first.ml, price_formatted:money(first.price), remaining_clp:budget-first.price,
    href:first.href, reason, available:true };
}
router.post('/compare', (req, res) => {
  const { budget_clp:budget, query = '' } = req.body;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000 || typeof query !== 'string' || query.length > 120) return res.status(400).json({detail:'Introduce un presupuesto válido y una búsqueda de hasta 120 caracteres.'});
  const products = search(Object.values(listCatalog()), {query, budget, stock:true});
  const items = products.map(p => result(p,budget,p.summary)).sort((a,b) => a.price-b.price || a.name.localeCompare(b.name));
  res.json({items, total_matches:items.length, currency:'CLP'});
});
router.post('/recommendations', async (req, res) => {
  const { budget_clp:budget, age, climate, occasion, gender } = req.body;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000 || !Number.isInteger(age) || age<1 || age>120 || ![climate,occasion,gender].every(x=>typeof x==='string' && x.length<60)) return res.status(400).json({detail:'Revisa el perfil y el presupuesto.'});
  let predicted = [], mode = 'catalog';
  try {
    const response = await fetch(new URL('/api/recommendations',process.env.PERFUME_SERVICE_URL || 'http://127.0.0.1:8000'), {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(5000),
      body:JSON.stringify({age,climate,occasion,gender,budget_clp:budget,rate:'950',top_n:10})
    });
    if (response.ok) { predicted=(await response.json()).items; mode='model+catalog'; }
  } catch { /* El catálogo permite seguir eligiendo cuando el modelo está detenido. */ }
  const products = Object.values(listCatalog()).filter(p=>p.available && options(p,budget).length);
  const mappedOccasion = occasionMap[occasion] || (/oficina|trabajo/i.test(occasion)?'oficina': /noche|fiesta/i.test(occasion)?'noche': /cita/i.test(occasion)?'cita': /formal/i.test(occasion)?'formal':'diario');
  const mappedClimate = /fr[ií]o/i.test(climate)?'frio':/cal/i.test(climate)?'calido':'templado';
  const ranked = products.map(p => {
    // Exact concentration only: Sauvage EDP is never sold as Sauvage EDT.
    const match = predicted.findIndex(item => normalize(item.name)===normalize(p.name+' '+p.badge) || normalize(item.name)===normalize(p.house+' '+p.name+' '+p.badge));
    const suitable = p.occasions.includes(mappedOccasion);
    return {p, score:(match>=0?20-match:0)+(suitable?5:0)+(p.climates.includes(mappedClimate)?3:0),
      reason:(match>=0?'Coincide con una sugerencia del modelo. ':'Alternativa del catálogo según tu perfil. ')+(suitable?'Adecuado para '+mappedOccasion+'. ':'')+p.summary};
  }).sort((a,b)=>b.score-a.score || a.p.id.localeCompare(b.p.id));
  res.json({items:ranked.slice(0,3).map(({p,reason})=>result(p,budget,reason)), mode,
    notice:mode==='catalog'?'Sugerencias del catálogo: el modelo no está disponible.':'Modelo combinado con opciones del catálogo. Los precios corresponden a decants, no a frascos completos.'});
});
router.post('/chat', (req,res) => {
  const message=req.body.message;
  if(typeof message!=='string' || !message.trim() || message.length>1000) return res.status(400).json({detail:'Escribe una consulta de hasta 1000 caracteres.'});
  const previous=Array.isArray(req.body.history) ? req.body.history.slice(-8).filter(h=>h?.role==='user' && typeof h.content==='string').map(h=>h.content.slice(0,1000)).join(' ') : '';
  const context=previous+' '+message;
  const text=normalize(context);
  const budgetMatch=[...context.matchAll(/(?:\$\s*|(?:menos de|hasta|presupuesto(?: de)?|por|tengo)\s*)(\d[\d.]*)(?:\s*(mil|k))?/gi)].at(-1);
  const budget=budgetMatch ? Number(budgetMatch[1].replace(/\./g,''))*(budgetMatch[2]?1000:1) : 100000000;
  const profile=/fresc|citric|limpio/.test(text)?'fresco':/dulce|vainilla/.test(text)?'dulce':/amader|madera/.test(text)?'amaderado':'';
  const occasion=/universidad|diario|clase/.test(text)?'diario':/oficina|trabajo/.test(text)?'oficina':/noche|fiesta/.test(text)?'noche':/cita/.test(text)?'cita':'';
  const catalog=Object.values(listCatalog());
  const named=catalog.filter(p=>normalize(p.name).split(' ').filter(w=>w.length>3).every(w=>text.includes(w)));
  const shopping=Boolean(budgetMatch||profile||occasion||named.length);
  let candidates=shopping ? search(named.length?named:catalog,{budget,stock:true,profile,occasion}) : [];
  const alternative=named.length && !candidates.length;
  if(alternative) candidates=search(catalog.filter(p=>!named.includes(p)),{budget,stock:true,profile,occasion}).filter(p=>p.profiles.some(tag=>named.some(n=>n.profiles.includes(tag))));
  const items=candidates.slice(0,3).map(p=>result(p,budget,(alternative?'Alternativa de perfil similar. ':'')+p.summary));
  let answer=shopping?(items.length?'Estas opciones están disponibles dentro de tu presupuesto. Elige el tamaño para ver su ficha; el despacho se calcula aparte.':'No encontré decants disponibles con esos criterios. Prueba otro presupuesto o perfil.'):'Puedo ayudarte a elegir decants del catálogo. Dime tu presupuesto y si buscas algo fresco, dulce o amaderado, y para qué ocasión.';
  if(named.length && /\bedp\b/.test(text) && named.every(p=>p.badge==='EDT')) answer='La concentración que pides no está en el catálogo. Como alternativa, tenemos la versión EDT que aparece abajo, con sus propios tamaños y precios.';
  if(alternative && items.length) answer='Ese perfume no tiene formatos disponibles dentro de tu presupuesto. Estas alternativas disponibles comparten su perfil olfativo.';
  if(!shopping && /pago|webpay|transferencia/.test(text)) answer='Puedes pagar con Webpay o transferencia. Revisa el total con despacho antes de confirmar.';
  if(!shopping && /despacho|envio/.test(text)) answer='El despacho se calcula por región en el carrito antes del pago: RM $5.000, zona central $10.000 y extremos $15.000. Selecciona tu región para ver el costo exacto.';
  res.json({answer,items,sources:['Catálogo de UPERFUMES'],matched:shopping});
});
module.exports=router;

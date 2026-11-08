const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {JSDOM,VirtualConsole,requestInterceptor} = require('jsdom');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'uperfumes-commerce-'));
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/data/commerce.json'),'utf8'));
process.env.DATABASE_PATH=path.join(temp,'orders.sqlite');
process.env.COMMERCE_CONFIG_PATH=path.join(temp,'commerce.json');
process.env.PERFUME_SERVICE_URL='http://127.0.0.1:1';
process.env.PUBLIC_BASE_URL='http://localhost';
fs.writeFileSync(process.env.COMMERCE_CONFIG_PATH,JSON.stringify(config));
let server,base;
before(async()=>{server=require('../src/app').listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));require('../src/db').close();fs.rmSync(temp,{recursive:true,force:true});});
async function post(route,body) {const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
const items=[{perfumeId:'pack-frescos',ml:3,qty:1}];
const order={items,region:'Metropolitana',quotedTotal:21776,customerName:'Cliente Test',customerEmail:'test@example.com',deliveryAddress:'Calle prueba 123',paymentMethod:'webpay'};
test('packs y despacho se calculan en servidor; Webpay recibe el total y se guarda el desglose',async()=>{
  const catalog=await (await fetch(base+'/api/catalog')).json();
  assert.deepEqual(catalog.packs.map(p=>p.price),[16776,14376]);
  for(const [region,shipping] of [['Metropolitana',5000],['Maule',10000],['Aysén',15000]]) {
    const result=await post('/api/quote',{items,region});assert.equal(result.status,200);assert.equal(result.body.total,16776+shipping);
  }
  let charged;
  require('../src/services/webpay').createTransaction=async args=>{charged=args.amount;return {token:'TEST_PACK',url:'https://example.com'};};
  const forged=await post('/api/orders',{...order,quotedTotal:1,amount:1,shipping:0});assert.equal(forged.status,409);assert.equal(charged,undefined);
  const created=await post('/api/orders',order);assert.equal(created.status,201);assert.equal(charged,21776);
  const saved=await (await fetch(base+'/api/orders/'+created.body.buyOrder)).json();
  assert.equal(saved.order.shippingAmount,5000);assert.equal(saved.order.subtotal,16776);assert.equal(saved.order.amount,21776);
  assert.match(saved.order.items[0].name,/Sauvage/);
  assert.equal((await post('/api/quote',{items,region:'No existe'})).status,400);
  assert.equal((await post('/api/quote',{items:[...items,{perfumeId:'pack-frescos',ml:3,qty:10}],region:'Metropolitana'})).status,400);
  fs.writeFileSync(process.env.COMMERCE_CONFIG_PATH,JSON.stringify({...config,shippingRegions:{...config.shippingRegions,Metropolitana:6000}}));
  try { assert.equal((await post('/api/orders',order)).status,409); }
  finally { fs.writeFileSync(process.env.COMMERCE_CONFIG_PATH,JSON.stringify(config)); }
});
test('comparador y chat toleran alias, presupuestos y concentraciones diferentes',async()=>{
  const compare=await post('/api/advisor/compare',{query:'JPG Elixir',budget_clp:15000});
  assert.equal(compare.body.items.length,1);assert.equal(compare.body.items[0].id,'jpg-le-male-elixir');
  assert.ok(compare.body.items[0].formats.every(f=>f.price<=15000));
  const chat=await post('/api/advisor/chat',{message:'Busco algo fresco para la universidad por menos de $15.000'});
  assert.ok(chat.body.items.length);assert.ok(chat.body.items.every(p=>p.formats.every(f=>f.price<=15000)));
  const concentration=await post('/api/advisor/chat',{message:'¿Cuánto cuesta Sauvage EDP?'});assert.match(concentration.body.answer,/alternativa/);
  const noBudget=await post('/api/advisor/compare',{query:'',budget_clp:1});assert.equal(noBudget.body.items.length,0);
  const fallback=await post('/api/advisor/recommendations',{age:25,climate:'Frío',occasion:'Oficina/Trabajo',gender:'Masculino',budget_clp:15000});
  assert.equal(fallback.body.mode,'catalog');assert.ok(fallback.body.items.length);assert.ok(fallback.body.items.every(p=>p.price<=15000));
});
test('agotados se excluyen de recomendaciones y packs y se rechazan al cobrar',async()=>{
  fs.writeFileSync(process.env.COMMERCE_CONFIG_PATH,JSON.stringify({...config,unavailableFormats:{'dior-sauvage-edt':[3,5,10]}}));
  try {
    const compare=await post('/api/advisor/compare',{query:'Sauvage',budget_clp:20000});assert.equal(compare.body.items.length,0);
    const alternatives=await post('/api/advisor/chat',{message:'Busco Sauvage por menos de $15.000'});
    assert.ok(alternatives.body.items.length);assert.ok(alternatives.body.items.every(p=>p.id!=='dior-sauvage-edt'));assert.match(alternatives.body.answer,/alternativas/);
    assert.equal((await post('/api/orders',order)).status,400);
    assert.equal((await post('/api/quote',{items:[{perfumeId:'dior-sauvage-edt',ml:3,qty:1}],region:'Metropolitana'})).status,400);
    const catalog=await (await fetch(base+'/api/catalog')).json();assert.equal(catalog.packs[0].available,false);
  } finally {fs.writeFileSync(process.env.COMMERCE_CONFIG_PATH,JSON.stringify(config));}
});
async function until(fn) {for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI timeout');}
test('catálogo filtra sin duplicar tarjetas y agrega el pack completo al carrito',async()=>{
  const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=await JSDOM.fromURL(base+'/',{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    resources:{interceptors:[requestInterceptor(r=>{if(!r.url.startsWith(base))return new Response('',{headers:{'Content-Type':'text/css'}});})]},
    beforeParse(w){w.matchMedia=()=>({matches:true});w.fetch=(url,opts)=>fetch(new URL(url,base),opts);w.Element.prototype.scrollIntoView=function(){};}});
  try {
    const doc=dom.window.document;await until(()=>doc.querySelectorAll('.shop-pack button').length===2);
    const search=doc.querySelector('#shopSearch');search.value='JPG Elixir';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    const visible=[...doc.querySelectorAll('#perfumeGrid .perfume-card[data-perfume]')].filter(e=>!e.hidden);assert.equal(visible.length,1);assert.equal(visible[0].dataset.perfume,'jpg-le-male-elixir');
    doc.querySelector('.shop-pack button').click();assert.deepEqual(JSON.parse(JSON.stringify(dom.window.UPCart.items())),[{id:'pack-frescos',ml:3,qty:1}]);
    await until(()=>doc.querySelector('#cartDrawer').textContent.includes('16.776'));assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

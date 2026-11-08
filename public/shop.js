(function () {
  'use strict';
  const money = n => '$' + n.toLocaleString('es-CL');
  const node = (tag, text, className) => { const n = document.createElement(tag); n.textContent = text; if (className) n.className=className; return n; };
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bjpg\b/g,'jean paul gaultier');
  async function init() {
    let data;
    try { const response=await fetch('/api/catalog'); if(!response.ok) throw Error(); data=await response.json(); }
    catch { return; }
    const grid=document.getElementById('perfumeGrid');
    if(grid) {
      const controls=node('form','','shop-filters'); controls.setAttribute('role','search');
      controls.innerHTML='<label>Marca o perfume<input type="search" id="shopSearch" placeholder="Ej.: JPG Elixir"></label><label>Ocasión<select id="shopOccasion"><option value="">Todas</option><option value="diario">Diario / universidad</option><option value="oficina">Oficina</option><option value="noche">Noche</option><option value="cita">Cita</option><option value="formal">Formal</option></select></label><label>Perfil<select id="shopProfile"><option value="">Todos</option><option value="fresco">Fresco</option><option value="dulce">Dulce</option><option value="amaderado">Amaderado</option></select></label><label>Precio máximo del decant<input type="number" id="shopBudget" min="1" placeholder="Sin límite"></label><label><input type="checkbox" id="shopStock"> Solo disponibles</label><button type="reset" class="cart-btn cart-btn--ghost">Limpiar filtros</button><p id="shopCount" role="status"></p>';
      grid.before(controls);
      function filter() {
        const terms=normalize(document.getElementById('shopSearch').value).split(/\s+/).filter(Boolean);
        const occasion=document.getElementById('shopOccasion').value;
        const profile=document.getElementById('shopProfile').value;
        const budget=Number(document.getElementById('shopBudget').value) || Infinity;
        const stock=document.getElementById('shopStock').checked;
        const family=document.querySelector('#filters .is-active')?.dataset.filter || 'todos';
        let count=0;
        grid.querySelectorAll('.perfume-card[data-perfume]').forEach(card=>{
          const p=data.products[card.dataset.perfume]; if(!p) return;
          const visible=terms.every(t=>normalize(p.house+' '+p.name+' '+p.badge).includes(t)) && (!occasion||p.occasions.includes(occasion)) && (!profile||p.profiles.includes(profile)) && (!stock||p.available) && p.formats.some(f=>f.price<=budget && (!stock||f.available)) && (family==='todos'||card.dataset.family===family);
          card.hidden=!visible; card.classList.toggle('is-filtered-out',!visible); if(visible) count++;
        });
        document.getElementById('shopCount').textContent=count+' fragancias · '+(count?'elige un tamaño para comprar':'prueba otros filtros');
      }
      grid.querySelectorAll('.perfume-card[data-perfume]').forEach(card=>{
        const p=data.products[card.dataset.perfume]; if(!p) return;
        const price=Math.min(...p.formats.map(f=>f.price));
        card.prepend(node('p','Desde '+money(price)+' · 3 ml · '+(p.available?'Disponible':'Agotado'),'shop-from'));
        card.querySelectorAll('.decant-buy').forEach(button=>{
          const format=p.formats.find(f=>f.ml===Number(button.dataset.ml));
          button.disabled=!format?.available;
          button.querySelector('.decant-price').textContent=format?.available?money(format.price):'Agotado';
        });
      });
      controls.addEventListener('submit',e=>e.preventDefault()); controls.addEventListener('input',filter);
      controls.addEventListener('reset',()=>{setTimeout(()=>{document.querySelector('#filters [data-filter="todos"]')?.click(); filter();},0);});
      document.getElementById('filters')?.addEventListener('click',filter); filter();
      const section=node('section','','shop-packs'); section.id='packs'; section.append(node('h2','Packs de descubrimiento'),node('p','Tres muestras de 3 ml para probar con calma. Ahorra un 20% sobre los formatos individuales.'));
      const cards=node('div','','shop-pack-grid'); section.append(cards);
      (data.packs||[]).forEach(pack=>{
        const card=node('article','','shop-pack'); card.append(node('h3',pack.name));
        const list=node('ul','');
        pack.items.forEach(item=>{const li=node('li','');const a=node('a',item.name+' · 3 ml'); a.href='/producto.html?id='+item.perfumeId;li.append(a);list.append(li);});card.append(list);
        const price=node('p',''); price.append(node('del',money(pack.originalPrice)),node('strong',' '+money(pack.price)+' CLP'));card.append(price,node('p','Ahorras '+money(pack.originalPrice-pack.price)+'. Despacho calculado al pagar.'));
        const button=node('button',pack.available?'Agregar pack al carrito':'Pack agotado','cart-btn cart-btn--primary');button.type='button';button.disabled=!pack.available;
        button.addEventListener('click',()=>{ if(window.UPCart.add(pack.id,3,1))window.UPCart.open(); });card.append(button);cards.append(card);
      });
      document.getElementById('coleccion').after(section);
      for(const parent of document.querySelectorAll('#siteNav, #pageHub .hub-nav')) {const link=node('a','Packs',parent.matches('.hub-nav')?'hub-link':'');link.href='/index.html#packs';parent.append(link);}
    }
    const productId=new URLSearchParams(location.search).get('id');
    const p=data.products[productId];
    if(p && document.getElementById('productInfo')) {
      const details=node('section','','shop-details');
      details.append(node('h2','¿Es para ti?'),node('p',p.summary),node('p','Intensidad: '+p.intensity+'. Depende de la piel y de cuántas veces apliques.'),node('p','Ideal para: '+p.occasions.join(', ')+'.'));
      const media=node('figure','');
      if(p.decantImage) {const image=document.createElement('img');image.src=p.decantImage;image.alt='Decant de '+p.name+' que se entrega';media.append(image,node('figcaption','Presentación del decant. Elige los mililitros arriba.'));}
      else media.append(node('figcaption','La imagen principal muestra el frasco de referencia. Recibes un decant del tamaño seleccionado; la foto de la muestra aún no está disponible.'));
      details.append(media);document.getElementById('productInfo').append(details);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

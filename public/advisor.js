(function () {
'use strict';

// Solo presentación: recomendación, conversación y comparación se resuelven en Python.
const base = new URL('/api/advisor/', document.baseURI);
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value) + ' CLP';
const history = [];

async function api(path, data) {
  const response = await fetch(new URL(path, base), data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Revisa los campos: usa montos positivos y las opciones disponibles.');
  }
  return response.json();
}

function feedback(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle('error', error);
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function showPanel() {
  const selected = ['recommend', 'compare', 'chat'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'recommend';
  document.querySelectorAll('[data-panel]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.panel === selected)));
  document.querySelectorAll('.advisor-main .panel').forEach(panel => { panel.hidden = panel.id !== selected; });
  document.querySelectorAll('a[href^="/asesor.html#"]').forEach(link => {
    if (link.hash === '#' + selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
  location.hash = button.dataset.panel;
}));
window.addEventListener('hashchange', showPanel);
showPanel();

$('recommend-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  $('recommend-results').replaceChildren();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    data.age = Number(data.age);
    data.budget_clp = Number(data.budget_clp);

    feedback('recommend-message', 'Buscando afinidades en el modelo…');
    const result = await api('recommendations', data);
    result.items.forEach(perfume => $('recommend-results').append(productCard(perfume)));
    feedback('recommend-message', result.items.length ? result.notice : 'No hay formatos disponibles con ese presupuesto.');
  } catch (error) { feedback('recommend-message', error.message, true); }
  finally { button.disabled = false; }
});

$('compare-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  $('compare-table').hidden = true;
  $('compare-results').replaceChildren();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    data.budget_clp = Number(data.budget_clp);

    feedback('compare-message', 'Comparando precios…');
    const result = await api('compare', data);
    result.items.forEach(perfume => {
      const row = document.createElement('tr');
      const cell = element('td', ''); const link = element('a', perfume.name + ' · ' + perfume.ml + ' ml'); link.href = perfume.href; cell.append(link); row.append(cell, element('td', perfume.price_formatted), element('td', money(perfume.remaining_clp)));
      $('compare-results').append(row);
    });
    $('compare-table').hidden = result.items.length === 0;
    feedback('compare-message', result.items.length ? `Mostrando ${result.items.length} opciones del catálogo · despacho no incluido.` : 'No encontramos perfumes con ese nombre y presupuesto. Prueba otro filtro.');
  } catch (error) { feedback('compare-message', error.message, true); }
  finally { button.disabled = false; }
});

function bubble(role, text, sources = []) {
  const item = element('article', '', 'bubble ' + role);
  item.append(element('strong', role === 'user' ? 'Tú' : 'Asesor UPerfumes'), element('p', text));
  if (sources.length) item.append(element('small', 'Fuente: ' + sources.join(' · ')));
  $('chat-log').append(item);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
}

$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('chat-message').value.trim();
  if (!message) return;
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {

    bubble('user', message);
    feedback('chat-feedback', 'Consultando la base de conocimiento local…');
    const result = await api('chat', { message, history: history.slice(-8) });
    bubble('assistant', result.answer, result.sources);
    (result.items || []).forEach(p => $('chat-log').append(productCard(p)));
    history.push({ role: 'user', content: message }, { role: 'assistant', content: result.answer });
    history.splice(0, Math.max(0, history.length - 8));
    $('chat-message').value = '';
    feedback('chat-feedback', '');
  } catch (error) { feedback('chat-feedback', error.message, true); }
  finally { button.disabled = false; $('chat-message').focus(); }
});

document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => {
  $('chat-message').value = button.dataset.question;
  $('chat-message').focus();
}));

function productCard(p) {
  const card = element('article', '', 'perfume-card');
  card.append(element('h3', p.name), element('p', p.reason), element('small', 'Disponible · despacho calculado al pagar'));
  p.formats.forEach(f => { const a = element('a', f.ml + ' ml · ' + money(f.price), 'cart-btn cart-btn--ghost'); a.href = f.href; card.append(a); });
  return card;
}
async function initialize() {
  try {
    const options = {climates:['Cálido/Tropical','Templado','Frío','Húmedo','Árido/Desértico'],occasions:['Diario/Casual','Oficina/Trabajo','Formal/Noche','Fiesta/Salida nocturna','Deportivo/Ejercicio','Cita romántica','Evento especial/Boda'],genders:['Masculino','Femenino','Unisex']};
    for (const [id, values] of [['climate', options.climates], ['occasion', options.occasions], ['gender', options.genders]]) {
      values.forEach(value => { const option = element('option', value); option.value = value; $(id).append(option); });
    }
    $('service-status').textContent = 'Decants del catálogo · Precios en pesos chilenos · Despacho calculado al pagar';
  } catch (error) { $('service-status').textContent = 'No pudimos conectar con el asesor. Revisa que el servicio esté iniciado.'; }
}
initialize();

})();

/* Jacks4WD – Presupuestos
 * Se llenan línea por línea, se totalizan con IVA, se guardan en datos/taller.json,
 * se exportan a PDF con la identidad visual de la nota de entrega y se envían por WhatsApp.
 * Usa las utilidades globales de app.js ($, esc, db, guardar, toast, etc.).
 */

// ===================== CONFIGURACIÓN =====================
const EMPRESA = {
  nombre: 'JACKS4WD',
  direccion: 'C.C.C.T. SOTANO 1',
  telefono: '0414-2333535',
  rif: 'J-506760762',
};
const IVA = 0.16;
const UNIDADES = ['Und.', 'Lts.', 'Serv.', 'Kit', 'Par', 'Jgo.'];
// Condiciones que se colocan por defecto en cada presupuesto nuevo (se pueden editar o borrar).
const CONDICIONES_PREDETERMINADAS = [
  '1. Anticipo: para iniciar los trabajos se requiere un anticipo del 50% del monto subtotal de este presupuesto.',
  '2. Variación del monto: el monto total puede variar hasta en un 10% por hallazgos o ajustes propios de la reparación, sin necesidad de aviso previo. Si la variación supera el 10%, se informará al cliente y no se realizarán trabajos adicionales hasta contar con su aprobación.',
  '3. Movilización del vehículo: la aprobación de este presupuesto autoriza a JACKS4WD a movilizar el vehículo para pruebas de manejo y para traslados a talleres o proveedores externos cuando el servicio lo requiera.',
].join('\n');

const ESTADOS_PRES ={ pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };

// ===================== UTILIDADES =====================
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const fmtUSD = (n) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCant = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '');
const numPres = (n) => '#' + String(n || 0).padStart(4, '0');

// Acepta "15.50", "15,50" o "1,234.50"
function parseDec(s) {
  s = String(s ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const lineaTotal = (it) => r2((it.cant || 0) * (it.precio || 0));
const itemsUsados = (p) => p.items.filter((it) => (it.desc || '').trim() || it.precio);

function totalesPres(p) {
  const subtotal = r2(itemsUsados(p).reduce((a, it) => a + lineaTotal(it), 0));
  const iva = r2(subtotal * IVA);
  return { subtotal, iva, total: r2(subtotal + iva) };
}

const siguienteNumero = () => Math.max(0, ...db.presupuestos.map((p) => p.numero || 0)) + 1;
const itemVacio = () => ({ cant: 1, unidad: 'Und.', desc: '', sku: '', precio: NaN });

// ===================== LISTADO =====================
function renderPresupuestos() {
  if (!db.presupuestos) db.presupuestos = [];
  const q = norm($('#buscar-pres').value).trim();
  const filtro = $('#filtro-pres').value;
  const lista = db.presupuestos
    .filter((p) => !filtro || p.estado === filtro)
    .filter((p) => !q || norm([numPres(p.numero), p.numero, p.cliente, p.vehiculo, p.telefono, ...p.items.map((i) => i.desc)].join(' ')).includes(q))
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('#tabla-pres').innerHTML = lista.map((p) => `
    <tr data-pid="${p.id}">
      <td><strong>${numPres(p.numero)}</strong></td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(p.cliente || '—')}</td>
      <td>${esc(p.vehiculo || '—')}</td>
      <td class="num"><strong>${fmtUSD(totalesPres(p).total)}</strong></td>
      <td><span class="estado-pres ${p.estado}">${ESTADOS_PRES[p.estado] || p.estado}</span></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-pact="pdf-lista" data-pid="${p.id}">PDF</button>
        <button class="btn tiny wa" data-pact="wa-lista" data-pid="${p.id}">WhatsApp</button>
      </td>
    </tr>`).join('');
  const vacio = $('#vacio-pres');
  vacio.hidden = lista.length > 0;
  vacio.textContent = db.presupuestos.length ? 'Ningún presupuesto coincide con la búsqueda.' : 'Aún no hay presupuestos. Pulsa "+ Nuevo presupuesto" para crear el primero.';
}

// ===================== EDITOR =====================
let presEdit = null;   // copia de trabajo del presupuesto abierto
let presNuevo = false;
let presDirty = false;

function mostrarEditor(si) {
  $('#pres-lista').hidden = si;
  $('#pres-editor').hidden = !si;
  if (si) $$('#pres-items textarea[name="desc"]').forEach(autoAltura);
  window.scrollTo(0, 0);
}

// extra (opcional): { items: [...], revisionId } — por ejemplo al crear desde una revisión
function nuevoPresupuesto(vid = null, extra = null) {
  if (!confirmarSalida()) return;
  presEdit = {
    id: uid(), numero: siguienteNumero(), fecha: hoyISO(), estado: 'pendiente',
    vehiculoId: null, cliente: '', telefono: '', vehiculo: '', direccion: '',
    items: [itemVacio()], observaciones: CONDICIONES_PREDETERMINADAS,
  };
  presNuevo = true; presDirty = false;
  if (vid) asignarVehiculo(vid);
  if (extra?.items?.length) { presEdit.items = extra.items.map((it) => ({ ...itemVacio(), ...it })); presDirty = true; }
  if (extra?.revisionId) presEdit.revisionId = extra.revisionId;
  pintarEditor();
  mostrarEditor(true);
  const c = $('#form-pres [name="cliente"]'); if (c && !vid) c.focus();
}

function abrirPresupuesto(id) {
  const p = db.presupuestos.find((x) => x.id === id); if (!p) return;
  presEdit = JSON.parse(JSON.stringify(p));
  presEdit.items = presEdit.items.map((it) => ({ ...it, precio: it.precio ?? NaN }));
  if (!presEdit.items.length) presEdit.items.push(itemVacio());
  presNuevo = false; presDirty = false;
  pintarEditor();
  mostrarEditor(true);
}

function asignarVehiculo(vid) {
  const v = vehiculo(vid); if (!v) return;
  const c = cliente(v.clienteId);
  Object.assign(presEdit, {
    vehiculoId: v.id, cliente: c?.nombre || '', telefono: c?.telefono || '',
    vehiculo: `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''} · ${v.placa}`,
  });
}

function filaHTML(it, i) {
  return `<tr data-i="${i}">
    <td class="col-cant">
      <input name="cant" inputmode="decimal" value="${Number.isFinite(it.cant) ? fmtCant(it.cant) : ''}" aria-label="Cantidad">
      <select name="unidad" aria-label="Unidad">${[...new Set([...UNIDADES, it.unidad || 'Und.'])].map((u) => `<option ${u === it.unidad ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
    </td>
    <td><textarea name="desc" rows="1" placeholder="Descripción del ítem" aria-label="Descripción">${esc(it.desc)}</textarea></td>
    <td class="col-sku"><input name="sku" value="${esc(it.sku)}" placeholder="—" aria-label="SKU"></td>
    <td class="num"><input name="precio" class="num" inputmode="decimal" value="${Number.isFinite(it.precio) ? r2(it.precio).toFixed(2) : ''}" placeholder="0.00" aria-label="Precio unitario"></td>
    <td class="num col-total">${fmtUSD(lineaTotal(it))}</td>
    <td class="col-quitar"><button type="button" class="btn tiny ghost" data-pact="quitar" title="Quitar línea">✕</button></td>
  </tr>`;
}

function pintarEditor() {
  const p = presEdit;
  $('#pres-editor').innerHTML = `
    <div class="card pres-toolbar">
      <button class="btn ghost" data-pact="volver">← Presupuestos</button>
      <label class="estado-sel">Estado
        <select id="pres-estado">${Object.entries(ESTADOS_PRES).map(([k, v]) => `<option value="${k}" ${k === p.estado ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <span class="spacer"></span>
      ${presNuevo ? '' : '<button class="btn ghost" data-pact="duplicar">Duplicar</button><button class="btn danger" data-pact="borrar">Eliminar</button>'}
      <button class="btn ghost" data-pact="pdf">⬇ PDF</button>
      <button class="btn wa" data-pact="wa">WhatsApp</button>
      <button class="btn primary" data-pact="guardar">Guardar</button>
    </div>

    <div class="card pres-buscar">
      <input id="pres-buscar" type="search" placeholder="Opcional: buscar cliente registrado por nombre, teléfono o placa para llenar sus datos…" autocomplete="off">
      <div id="pres-res" class="picker-list"></div>
    </div>

    <form id="form-pres" class="doc doc-editor" autocomplete="off">
      <div class="doc-head">
        <img class="doc-logo" src="img/logo.png" alt="Jacks">
        <div class="doc-empresa">
          <div class="doc-nombre">${EMPRESA.nombre}</div>
          <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
        </div>
      </div>
      <div class="doc-numero">PRESUPUESTO ${numPres(p.numero)}</div>

      <div class="doc-box">
        <div class="doc-fila2">
          <label>CLIENTE: <input name="cliente" value="${esc(p.cliente)}" placeholder="Nombre (opcional)"></label>
          <label class="r">FECHA: <input name="fecha" type="date" value="${p.fecha}"></label>
        </div>
        <div class="doc-fila2">
          <label>TELÉFONO: <input name="telefono" value="${esc(p.telefono)}" placeholder="0414-1234567" inputmode="tel"></label>
          <label class="r">VEHÍCULO: <input name="vehiculo" value="${esc(p.vehiculo)}" placeholder="Marca, modelo, placa (opcional)"></label>
        </div>
        <div class="doc-fila2 doc-fila-opc">
          <label>DIRECCIÓN: <input name="direccion" value="${esc(p.direccion)}" placeholder="(opcional, solo aparece en el PDF si la escribes)"></label>
        </div>
      </div>

      <table class="doc-items">
        <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>SKU</th><th class="num">PRECIO USD</th><th class="num">TOTAL USD</th><th></th></tr></thead>
        <tbody id="pres-items">${p.items.map(filaHTML).join('')}</tbody>
      </table>
      <div class="doc-add">
        <button type="button" class="btn small ghost" data-pact="fila">+ Agregar línea</button>
        <small class="hint">Pulsa <strong>Enter</strong> en cualquier línea para agregar otra.</small>
      </div>

      <div class="doc-totales">
        <div>TOTAL DE ITEMS: <span id="pres-nitems"></span></div>
        <div class="doc-sumas">
          <div><span>SUBTOTAL USD:</span><span id="pres-sub"></span></div>
          <div><span>IVA (${Math.round(IVA * 100)}%):</span><span id="pres-iva"></span></div>
          <div class="total"><span>TOTAL USD:</span><span id="pres-total"></span></div>
        </div>
      </div>

      <div class="doc-obs">
        <div class="lbl">Observaciones y condiciones
          <span class="obs-acciones">
            <button type="button" class="btn tiny ghost" data-pact="obs-condiciones" title="Volver a poner las condiciones predefinidas">Restaurar condiciones</button>
            <button type="button" class="btn tiny ghost" data-pact="obs-borrar" title="Dejar las observaciones en blanco">Borrar todo</button>
          </span>
        </div>
        <textarea name="observaciones" rows="5" placeholder="Ej: validez del presupuesto, tiempo de entrega, garantía…">${esc(p.observaciones)}</textarea>
      </div>
    </form>`;
  actualizarTotales();
}

// Lee el formulario y las líneas hacia presEdit
function leerEditor() {
  const f = $('#form-pres'); if (!f || !presEdit) return;
  ['cliente', 'fecha', 'vehiculo', 'telefono', 'direccion', 'observaciones'].forEach((k) => (presEdit[k] = f[k].value.trim()));
  presEdit.estado = $('#pres-estado').value;
  presEdit.items = $$('#pres-items tr').map((tr) => {
    const g = (n) => tr.querySelector(`[name="${n}"]`).value;
    const cant = parseDec(g('cant'));
    return { cant: Number.isFinite(cant) ? cant : 0, unidad: g('unidad'), desc: g('desc').trim(), sku: g('sku').trim(), precio: parseDec(g('precio')) };
  });
}

// La descripción crece en altura para mostrar textos largos completos
function autoAltura(el) {
  if (!el.offsetParent) return; // oculto: se mide al mostrarse
  el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px';
}

function actualizarTotales() {
  leerEditor();
  $$('#pres-items textarea[name="desc"]').forEach((t) => { if (!t.style.height || t.style.height === '2px') autoAltura(t); });
  $$('#pres-items tr').forEach((tr, i) => { tr.querySelector('.col-total').textContent = fmtUSD(lineaTotal(presEdit.items[i])); });
  const t = totalesPres(presEdit);
  $('#pres-nitems').textContent = itemsUsados(presEdit).length;
  $('#pres-sub').textContent = fmtUSD(t.subtotal);
  $('#pres-iva').textContent = fmtUSD(t.iva);
  $('#pres-total').textContent = fmtUSD(t.total);
}

function agregarFila(focus = true) {
  leerEditor();
  presEdit.items.push(itemVacio());
  const tbody = $('#pres-items');
  tbody.insertAdjacentHTML('beforeend', filaHTML(presEdit.items.at(-1), presEdit.items.length - 1));
  presDirty = true;
  if (focus) tbody.lastElementChild.querySelector('[name="desc"]').focus();
  actualizarTotales();
}

async function guardarPresupuesto(silencioso = false) {
  leerEditor();
  const p = presEdit;
  p.items = p.items.filter((it) => it.desc || Number.isFinite(it.precio));
  if (!p.items.length) { alert('Agrega al menos una línea con descripción o precio.'); p.items.push(itemVacio()); return false; }
  p.actualizado = new Date().toISOString();
  const guardado = JSON.parse(JSON.stringify(p, (k, v) => (typeof v === 'number' && Number.isNaN(v) ? null : v)));
  if (presNuevo) {
    guardado.creado = p.actualizado;
    db.presupuestos.push(guardado);
    presNuevo = false;
  } else {
    const i = db.presupuestos.findIndex((x) => x.id === p.id);
    if (i >= 0) db.presupuestos[i] = { ...db.presupuestos[i], ...guardado };
  }
  presDirty = false;
  await guardar();
  pintarEditor();
  if (!silencioso) toast(`Presupuesto ${numPres(p.numero)} guardado`);
  return true;
}

function confirmarSalida() {
  if (!presDirty) return true;
  return confirm('Este presupuesto tiene cambios sin guardar. ¿Salir sin guardar?');
}

function volverALista() {
  if (!confirmarSalida()) return;
  presEdit = null; presDirty = false;
  mostrarEditor(false);
  renderPresupuestos();
}

// ===================== PDF =====================
function docPresHTML(p) {
  const t = totalesPres(p);
  const items = itemsUsados(p);
  return `<div class="doc doc-print">
    <div class="doc-head">
      <img class="doc-logo" src="img/logo.png" alt="Jacks">
      <div class="doc-empresa">
        <div class="doc-nombre">${EMPRESA.nombre}</div>
        <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
      </div>
    </div>
    <div class="doc-numero">PRESUPUESTO ${numPres(p.numero)}</div>
    <div class="doc-box">
      <div class="doc-fila2">
        <div>CLIENTE: ${esc(p.cliente)}</div>
        <div class="r">FECHA: ${fmtFecha(p.fecha)}</div>
      </div>
      <div class="doc-fila2">
        <div>TELÉFONO: ${esc(p.telefono)}</div>
        <div class="r">VEHÍCULO: ${esc(p.vehiculo)}</div>
      </div>
      ${p.direccion ? `<div class="doc-fila2"><div>DIRECCIÓN: ${esc(p.direccion)}</div></div>` : ''}
    </div>
    <table class="doc-items">
      <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>SKU</th><th class="num">PRECIO USD</th><th class="num">TOTAL USD</th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        <td>${fmtCant(it.cant)} ${esc(it.unidad)}</td>
        <td>${esc(it.desc)}</td>
        <td>${esc(it.sku)}</td>
        <td class="num">${fmtUSD(it.precio)}</td>
        <td class="num">${fmtUSD(lineaTotal(it))}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="doc-totales">
      <div>TOTAL DE ITEMS: ${items.length}</div>
      <div class="doc-sumas">
        <div><span>SUBTOTAL USD:</span><span>${fmtUSD(t.subtotal)}</span></div>
        <div><span>IVA (${Math.round(IVA * 100)}%):</span><span>${fmtUSD(t.iva)}</span></div>
        <div class="total"><span>TOTAL USD:</span><span>${fmtUSD(t.total)}</span></div>
      </div>
    </div>
    ${p.observaciones ? `<div class="doc-obs">
      <div class="lbl">Observaciones y condiciones</div>
      <div class="obs-texto">${esc(p.observaciones).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
  </div>`;
}

function exportarPDF(p) {
  imprimirDocumento(docPresHTML(p), `Presupuesto ${numPres(p.numero).slice(1)}${p.cliente ? ' - ' + p.cliente : ''}`);
}

// Imprime un documento (presupuesto, revisión…) sin encabezados del navegador.
// El título sugerido se usa como nombre del archivo PDF.
function imprimirDocumento(html, titulo) {
  const area = $('#print-area');
  area.innerHTML = `<table class="print-wrap">
    <thead><tr><td><div class="esp"></div></td></tr></thead>
    <tbody><tr><td>${html}</td></tr></tbody>
    <tfoot><tr><td><div class="esp"></div></td></tr></tfoot>
  </table>`;
  const tituloOriginal = document.title;
  document.title = titulo.replace(/[\\/:*?"<>|]/g, '');
  const restaurar = () => { document.title = tituloOriginal; window.removeEventListener('afterprint', restaurar); };
  window.addEventListener('afterprint', restaurar);
  const img = area.querySelector('img');
  const imprimir = () => setTimeout(() => window.print(), 50);
  if (img && !img.complete) { img.onload = img.onerror = imprimir; } else imprimir();
}

// ===================== WHATSAPP =====================
function mensajePresupuesto(p) {
  const t = totalesPres(p);
  const lineas = itemsUsados(p).map((it) => `• ${fmtCant(it.cant)} ${it.unidad} ${it.desc} — $${fmtUSD(lineaTotal(it))}`);
  return [
    `Hola${p.cliente ? ' ' + p.cliente : ''}, te enviamos el presupuesto ${numPres(p.numero)} de ${CONFIG.taller}${p.vehiculo ? ' para tu vehículo ' + p.vehiculo : ''}:`,
    '',
    ...lineas,
    '',
    `Subtotal: $${fmtUSD(t.subtotal)}`,
    `IVA (${Math.round(IVA * 100)}%): $${fmtUSD(t.iva)}`,
    `*Total: $${fmtUSD(t.total)} USD*`,
    ...(p.observaciones ? ['', p.observaciones] : []),
    '',
    'Quedamos atentos a tu aprobación. ¡Gracias por confiar en nosotros!',
    `— ${CONFIG.taller}`,
  ].join('\n');
}

async function enviarWhatsApp(p) {
  let tel = (p.telefono || '').trim();
  if (soloDigitos(tel).length < 10) {
    tel = (prompt('Número de WhatsApp del cliente (ej: 0414-1234567):', tel) || '').trim();
    if (!tel) return;
    if (soloDigitos(tel).length < 10) { alert('El número debe tener al menos 10 dígitos.'); return; }
    p.telefono = tel;
    const guardado = db.presupuestos.find((x) => x.id === p.id);
    if (guardado) guardado.telefono = tel;
    if (presEdit && presEdit.id === p.id) { const inp = $('#form-pres [name="telefono"]'); if (inp) inp.value = tel; }
  }
  window.open(`https://wa.me/${telWhatsApp(tel)}?text=${encodeURIComponent(mensajePresupuesto(p))}`, '_blank', 'noopener');
  db.mensajes = db.mensajes || [];
  db.mensajes.push({ id: uid(), vehiculoId: p.vehiculoId || null, telefono: tel, tipo: 'presupuesto', texto: `Presupuesto ${numPres(p.numero)} · Total $${fmtUSD(totalesPres(p).total)}`, fecha: hoyISO(), creado: new Date().toISOString() });
  await guardar(false);
  toast('Mensaje abierto en WhatsApp. Si quieres, adjunta también el PDF.');
}

// ===================== EVENTOS =====================
function initPresupuestos() {
  $('#btn-nuevo-pres').onclick = () => nuevoPresupuesto();
  $('#buscar-pres').oninput = renderPresupuestos;
  $('#filtro-pres').onchange = renderPresupuestos;

  $('#tabla-pres').onclick = (e) => {
    const b = e.target.closest('[data-pact]');
    const p = db.presupuestos.find((x) => x.id === (b || e.target.closest('[data-pid]'))?.dataset.pid);
    if (!p) return;
    if (b?.dataset.pact === 'pdf-lista') return exportarPDF(p);
    if (b?.dataset.pact === 'wa-lista') return enviarWhatsApp(p);
    abrirPresupuesto(p.id);
  };

  const ed = $('#pres-editor');
  ed.addEventListener('input', (e) => {
    if (e.target.id === 'pres-buscar') {
      const lista = buscarVehiculos(e.target.value).slice(0, 6);
      $('#pres-res').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong> <small>${esc(cliente(v.clienteId).telefono)}</small><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
      return;
    }
    if (e.target.name === 'desc') autoAltura(e.target);
    if (e.target.closest('#form-pres')) { presDirty = true; actualizarTotales(); }
  });
  ed.addEventListener('change', (e) => {
    if (e.target.id === 'pres-estado' || e.target.closest('#form-pres')) { presDirty = true; actualizarTotales(); }
    // Al salir del precio, mostrarlo con 2 decimales
    if (e.target.name === 'precio') { const n = parseDec(e.target.value); if (Number.isFinite(n)) e.target.value = r2(n).toFixed(2); }
  });
  ed.addEventListener('keydown', (e) => {
    // Enter agrega/pasa a la siguiente línea (Shift+Enter permite salto de línea en la descripción)
    if (e.key !== 'Enter' || e.shiftKey || !e.target.closest('#form-pres') || e.target.name === 'observaciones') return;
    e.preventDefault();
    const tr = e.target.closest('#pres-items tr');
    if (!tr) return;
    const next = tr.nextElementSibling;
    if (next) next.querySelector('[name="desc"]').focus(); else agregarFila();
  });
  ed.addEventListener('submit', (e) => e.preventDefault());
  ed.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      leerEditor(); asignarVehiculo(pick.dataset.pick); presDirty = true;
      const f = $('#form-pres');
      ['cliente', 'telefono', 'vehiculo'].forEach((k) => (f[k].value = presEdit[k]));
      $('#pres-res').innerHTML = ''; $('#pres-buscar').value = '';
      return;
    }
    const b = e.target.closest('[data-pact]'); if (!b) return;
    switch (b.dataset.pact) {
      case 'volver': volverALista(); break;
      case 'fila': agregarFila(); break;
      case 'obs-condiciones': {
        const t = $('#form-pres [name="observaciones"]');
        if (t.value.includes(CONDICIONES_PREDETERMINADAS)) { toast('Las condiciones ya están incluidas'); break; }
        t.value = t.value.trim() ? t.value.trim() + '\n' + CONDICIONES_PREDETERMINADAS : CONDICIONES_PREDETERMINADAS;
        presDirty = true; actualizarTotales();
        break;
      }
      case 'obs-borrar':
        $('#form-pres [name="observaciones"]').value = '';
        presDirty = true; actualizarTotales();
        break;
      case 'quitar': {
        leerEditor();
        const i = Number(b.closest('tr').dataset.i);
        presEdit.items.splice(i, 1);
        if (!presEdit.items.length) presEdit.items.push(itemVacio());
        presDirty = true;
        $('#pres-items').innerHTML = presEdit.items.map(filaHTML).join('');
        actualizarTotales();
        break;
      }
      case 'guardar': await guardarPresupuesto(); break;
      case 'pdf': if (await guardarPresupuesto(true)) exportarPDF(presEdit); break;
      case 'wa': if (await guardarPresupuesto(true)) enviarWhatsApp(presEdit); break;
      case 'duplicar': {
        if (!confirmarSalida()) break;
        const base = JSON.parse(JSON.stringify(presEdit));
        presEdit = { ...base, id: uid(), numero: siguienteNumero(), fecha: hoyISO(), estado: 'pendiente', creado: undefined };
        presNuevo = true; presDirty = true;
        pintarEditor();
        toast(`Copia creada como ${numPres(presEdit.numero)} (sin guardar)`);
        break;
      }
      case 'borrar':
        if (confirm(`¿Eliminar el presupuesto ${numPres(presEdit.numero)}? Esto no se puede deshacer.`)) {
          db.presupuestos = db.presupuestos.filter((x) => x.id !== presEdit.id);
          presDirty = false; await guardar(); volverALista(); toast('Presupuesto eliminado');
        }
        break;
    }
  });

  // Aviso si se cierra la ventana con cambios sin guardar
  window.addEventListener('beforeunload', (e) => { if (presDirty) { e.preventDefault(); e.returnValue = ''; } });

  renderPresupuestos();
}

initPresupuestos();

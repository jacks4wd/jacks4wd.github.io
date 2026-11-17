/* Jacks4WD – Reparaciones
 * Se crean al aprobar un presupuesto. Guardan los datos del cliente, el técnico que repara
 * (editable), los ítems aprobados y los rechazados ("pendiente por reparación"), notas extra
 * (garantía, detalles) y el número de nota de entrega del sistema administrativo.
 * NO guardan precios.
 */

const ESTADOS_REP = { en_proceso: 'En proceso', terminada: 'Terminada' };
const numRep = (n) => '#' + String(n || 0).padStart(4, '0');
const siguienteNumeroRep = () => Math.max(0, ...(db.reparaciones || []).map((r) => r.numero || 0)) + 1;

// Crea la reparación de un presupuesto aprobado, o la actualiza si ya existe
// (conservando técnico editado a mano, notas, nota de entrega y estado).
function crearOActualizarReparacion(p) {
  if (!db.reparaciones) db.reparaciones = [];
  const items = p.aprobacion.items.map((it) => ({
    cant: it.cant, unidad: it.unidad, desc: it.desc, sku: it.sku,
    estado: it.aprobado ? 'aprobado' : 'rechazado',
  }));
  // Si la reparación estaba abierta en pantalla, se cierra para no guardar luego una copia vieja
  if (typeof repEdit !== 'undefined' && repEdit && repEdit.id === p.reparacionId) { repEdit = null; repDirty = false; mostrarEditorRep(false); }
  let rep = p.reparacionId && db.reparaciones.find((r) => r.id === p.reparacionId);
  const base = { presupuestoId: p.id, presupuestoNumero: p.numero, vehiculoId: p.vehiculoId || null, cliente: p.cliente, telefono: p.telefono, vehiculo: p.vehiculo, items };
  if (rep) {
    Object.assign(rep, base, { tecnico: rep.tecnico || p.aprobacion.tecnico, actualizado: new Date().toISOString() });
  } else {
    rep = { id: uid(), numero: siguienteNumeroRep(), fecha: p.aprobacion.fecha || hoyISO(), tecnico: p.aprobacion.tecnico, notas: '', notaEntrega: '', estado: 'en_proceso', ...base, creado: new Date().toISOString() };
    db.reparaciones.push(rep);
  }
  return rep;
}

// ===================== SUBPESTAÑAS =====================
function irSubtabPres(cual) {
  $$('.subtab[data-prtab]').forEach((b) => b.classList.toggle('active', b.dataset.prtab === cual));
  $('#pr-presupuestos').hidden = cual !== 'presupuestos';
  $('#pr-reparaciones').hidden = cual !== 'reparaciones';
  if (cual === 'reparaciones') renderReparaciones();
}

// ===================== LISTADO =====================
function renderReparaciones() {
  if (!db.reparaciones) db.reparaciones = [];
  $('#rep-contador').textContent = db.reparaciones.filter((r) => r.estado === 'en_proceso').length || '';
  if (!$('#tabla-rep')) return;
  const q = norm($('#buscar-rep').value).trim();
  const filtro = $('#filtro-rep').value;
  const lista = db.reparaciones
    .filter((r) => !filtro || r.estado === filtro)
    .filter((r) => !q || norm([numRep(r.numero), r.cliente, r.telefono, r.vehiculo, r.tecnico, r.notaEntrega, ...r.items.map((i) => i.desc)].join(' ')).includes(q))
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('#tabla-rep').innerHTML = lista.map((r) => {
    const ap = r.items.filter((i) => i.estado === 'aprobado').length;
    const re = r.items.length - ap;
    return `<tr data-repid="${r.id}">
      <td><strong>${numRep(r.numero)}</strong></td>
      <td>${fmtFecha(r.fecha)}</td>
      <td>${esc(r.cliente || '—')}</td>
      <td>${esc(r.vehiculo || '—')}</td>
      <td>${esc(r.tecnico || '—')}</td>
      <td><span class="rv-mini rv-bueno" title="Aprobados">${ap}</span>${re ? `<span class="rv-mini rv-urgente" title="Rechazados, pendientes">${re}</span>` : ''}</td>
      <td>${esc(r.notaEntrega || '—')}</td>
      <td><span class="estado-rep ${r.estado}">${ESTADOS_REP[r.estado]}</span></td>
    </tr>`;
  }).join('');
  const v = $('#vacio-rep');
  v.hidden = lista.length > 0;
  v.textContent = db.reparaciones.length ? 'Ninguna reparación coincide con la búsqueda.' : 'Aún no hay reparaciones. Se crean al marcar un presupuesto como "Aprobado".';
}

// ===================== EDITOR =====================
let repEdit = null;
let repDirty = false;

function mostrarEditorRep(si) {
  $('#rep-lista').hidden = si;
  $('#rep-editor').hidden = !si;
  window.scrollTo(0, 0);
}

function abrirReparacion(id) {
  const r = (db.reparaciones || []).find((x) => x.id === id); if (!r) return;
  repEdit = JSON.parse(JSON.stringify(r)); repDirty = false;
  pintarEditorRep();
  mostrarEditorRep(true);
}

function itemsRepHTML(r, editable) {
  return r.items.map((it, i) => `<tr data-ri="${i}">
    <td>${fmtCant(it.cant)} ${esc(it.unidad)}</td>
    <td>${esc(it.desc)}</td>
    <td>${esc(it.sku)}</td>
    <td>${editable
      ? `<button type="button" class="rep-estado ${it.estado}" data-rep="toggle" title="Tocar para cambiar">${it.estado === 'aprobado' ? 'Aprobado' : 'Rechazado – pendiente por reparación'}</button>`
      : `<span class="rep-estado ${it.estado}">${it.estado === 'aprobado' ? 'Aprobado' : 'Rechazado – pendiente por reparación'}</span>`}</td>
  </tr>`).join('');
}

function pintarEditorRep() {
  const r = repEdit;
  const otro = r.tecnico && !tecnicos().includes(r.tecnico);
  $('#rep-editor').innerHTML = `
    <div class="card pres-toolbar">
      <button class="btn ghost" data-rep="volver">← Reparaciones</button>
      <span class="estado-rep ${r.estado}">${ESTADOS_REP[r.estado]}</span>
      <span class="spacer"></span>
      ${r.presupuestoId ? '<button class="btn ghost" data-rep="presupuesto">Ver presupuesto</button>' : ''}
      <button class="btn danger" data-rep="borrar">Eliminar</button>
      <button class="btn ghost" data-rep="pdf">⬇ PDF</button>
      <button class="btn primary" data-rep="guardar">Guardar</button>
    </div>
    <form id="form-rep" class="doc doc-editor" autocomplete="off">
      <div class="doc-head">
        <img class="doc-logo" src="img/logo.png" alt="Jacks">
        <div class="doc-empresa">
          <div class="doc-nombre">${EMPRESA.nombre}</div>
          <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
        </div>
      </div>
      <div class="doc-numero">REPARACIÓN ${numRep(r.numero)}${r.presupuestoNumero ? ` <small class="rep-sub">· Presupuesto ${numPres(r.presupuestoNumero)}</small>` : ''}</div>
      <div class="doc-box">
        <div class="doc-fila2"><div>CLIENTE: ${esc(r.cliente)}</div><div class="r">FECHA: ${fmtFecha(r.fecha)}</div></div>
        <div class="doc-fila2"><div>TELÉFONO: ${esc(r.telefono)}</div><div class="r">VEHÍCULO: ${esc(r.vehiculo)}</div></div>
        <div class="doc-fila2">
          <label>TÉCNICO: <select id="rep-tecnico">${opcionesTecnico(r.tecnico)}</select>
            <input id="rep-tecnico-otro" value="${otro ? esc(r.tecnico) : ''}" placeholder="Nombre" ${otro ? '' : 'hidden'}></label>
          <label class="r">ESTADO: <select id="rep-estado">${Object.entries(ESTADOS_REP).map(([k, n]) => `<option value="${k}" ${r.estado === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
      </div>
      <table class="doc-items rep-tabla">
        <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>SKU</th><th>ESTADO</th></tr></thead>
        <tbody>${itemsRepHTML(r, true)}</tbody>
      </table>
      <p class="hint">Toca el estado de un ítem para cambiarlo (por ejemplo, si el cliente aprueba después un ítem rechazado).</p>
      <div class="doc-obs" style="border-top:1px solid #111">
        <div class="lbl">Notas de la reparación</div>
        <textarea id="rep-notas" rows="3" placeholder="Ej: garantía de 3 meses en piezas; reemplazo solo bujes, no muñones: el ruido continuará…">${esc(r.notas)}</textarea>
      </div>
      <div class="rep-nota-entrega">
        <label>N° de nota de entrega (sistema administrativo)
          <input id="rep-nota-entrega" value="${esc(r.notaEntrega)}" placeholder="Ej: 437" inputmode="numeric">
        </label>
      </div>
    </form>`;
}

function leerEditorRep() {
  const r = repEdit; if (!r || !$('#rep-tecnico')) return;
  const t = $('#rep-tecnico').value;
  r.tecnico = t === '__otro' ? $('#rep-tecnico-otro').value.trim() : t;
  r.estado = $('#rep-estado').value;
  r.notas = $('#rep-notas').value.trim();
  r.notaEntrega = $('#rep-nota-entrega').value.trim();
}

async function guardarReparacion(silencioso = false) {
  leerEditorRep();
  const r = repEdit;
  r.actualizado = new Date().toISOString();
  // Solo se actualizan los campos que se editan aquí, sobre la versión más reciente
  // (así nunca se pierden cambios hechos desde la aprobación del presupuesto)
  const actual = db.reparaciones.find((x) => x.id === r.id);
  if (actual) {
    Object.assign(actual, { tecnico: r.tecnico, estado: r.estado, notas: r.notas, notaEntrega: r.notaEntrega, actualizado: r.actualizado });
    const mismosItems = actual.items.length === r.items.length && actual.items.every((it, i) => it.desc === r.items[i].desc);
    if (mismosItems) actual.items.forEach((it, i) => (it.estado = r.items[i].estado));
    repEdit = JSON.parse(JSON.stringify(actual));
  }
  repDirty = false;
  await guardar();
  if (!silencioso) toast(`Reparación ${numRep(r.numero)} guardada`);
}

function volverAListaRep() {
  if (repDirty && !confirm('La reparación tiene cambios sin guardar. ¿Salir sin guardar?')) return;
  repEdit = null; repDirty = false;
  mostrarEditorRep(false);
  renderReparaciones();
}

// ===================== PDF (orden de reparación, sin precios) =====================
function docRepHTML(r) {
  return `<div class="doc doc-print">
    <div class="doc-head">
      <img class="doc-logo" src="img/logo.png" alt="Jacks">
      <div class="doc-empresa">
        <div class="doc-nombre">${EMPRESA.nombre}</div>
        <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
      </div>
    </div>
    <div class="doc-numero">REPARACIÓN ${numRep(r.numero)}</div>
    <div class="doc-box">
      <div class="doc-fila2"><div>CLIENTE: ${esc(r.cliente)}</div><div class="r">FECHA: ${fmtFecha(r.fecha)}</div></div>
      <div class="doc-fila2"><div>TELÉFONO: ${esc(r.telefono)}</div><div class="r">VEHÍCULO: ${esc(r.vehiculo)}</div></div>
      <div class="doc-fila2"><div>TÉCNICO: ${esc(r.tecnico)}</div><div class="r">${r.notaEntrega ? 'NOTA DE ENTREGA: ' + esc(r.notaEntrega) : ''}</div></div>
    </div>
    <table class="doc-items rep-tabla">
      <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>SKU</th><th>ESTADO</th></tr></thead>
      <tbody>${itemsRepHTML(r, false)}</tbody>
    </table>
    ${r.notas ? `<div class="doc-obs" style="border-top:1px solid #111;margin-top:8px">
      <div class="lbl">Notas de la reparación</div>
      <div class="obs-texto">${esc(r.notas).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
  </div>`;
}

// ===================== EVENTOS =====================
function initReparaciones() {
  if (!db.reparaciones) db.reparaciones = [];
  $$('.subtab[data-prtab]').forEach((b) => (b.onclick = () => {
    if (b.dataset.prtab === 'reparaciones' && typeof presDirty !== 'undefined' && presDirty && !confirm('El presupuesto tiene cambios sin guardar. ¿Salir sin guardar?')) return;
    if (b.dataset.prtab === 'presupuestos' && repDirty && !confirm('La reparación tiene cambios sin guardar. ¿Salir sin guardar?')) return;
    if (b.dataset.prtab === 'reparaciones') presDirty = false; else repDirty = false;
    irSubtabPres(b.dataset.prtab);
  }));
  $('#buscar-rep').oninput = renderReparaciones;
  $('#filtro-rep').onchange = renderReparaciones;
  $('#tabla-rep').onclick = (e) => { const tr = e.target.closest('[data-repid]'); if (tr) abrirReparacion(tr.dataset.repid); };

  const ed = $('#rep-editor');
  ed.addEventListener('input', () => { repDirty = true; });
  ed.addEventListener('change', (e) => {
    repDirty = true;
    if (e.target.id === 'rep-tecnico') { const o = $('#rep-tecnico-otro'); o.hidden = e.target.value !== '__otro'; if (!o.hidden) o.focus(); }
  });
  ed.addEventListener('submit', (e) => e.preventDefault());
  ed.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rep]'); if (!b || !repEdit) return;
    switch (b.dataset.rep) {
      case 'volver': volverAListaRep(); break;
      case 'guardar': await guardarReparacion(); volverAListaRep(); break;
      case 'toggle': {
        leerEditorRep();
        const it = repEdit.items[Number(b.closest('tr').dataset.ri)];
        it.estado = it.estado === 'aprobado' ? 'rechazado' : 'aprobado';
        repDirty = true; pintarEditorRep(); break;
      }
      case 'pdf':
        if (repDirty) await guardarReparacion(true);
        imprimirDocumento(docRepHTML(repEdit), `Reparacion ${numRep(repEdit.numero).slice(1)}${repEdit.cliente ? ' - ' + repEdit.cliente : ''}`);
        break;
      case 'presupuesto':
        if (repDirty && !confirm('La reparación tiene cambios sin guardar. ¿Salir sin guardar?')) break;
        {
          // Se cierra la reparación para que no quede una copia vieja abierta
          const pid = repEdit.presupuestoId;
          repEdit = null; repDirty = false; mostrarEditorRep(false);
          irSubtabPres('presupuestos'); abrirPresupuesto(pid);
        }
        break;
      case 'borrar':
        if (!confirm(`¿Eliminar la reparación ${numRep(repEdit.numero)}? El presupuesto aprobado se conserva.`)) break;
        db.reparaciones = db.reparaciones.filter((x) => x.id !== repEdit.id);
        db.presupuestos.forEach((p) => { if (p.reparacionId === repEdit.id) delete p.reparacionId; });
        repDirty = false; await guardar(); volverAListaRep(); toast('Reparación eliminada');
        break;
    }
  });

  window.addEventListener('beforeunload', (e) => { if (repDirty) { e.preventDefault(); e.returnValue = ''; } });
  renderReparaciones();
}

initReparaciones();

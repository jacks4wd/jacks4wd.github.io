/* Jacks4WD – Reparaciones
 * Se crean al aprobar un presupuesto. Guardan los datos del cliente, el técnico que repara
 * (editable), los ítems aprobados y los rechazados ("pendiente por reparación"), notas extra
 * (garantía, detalles) y el número de nota de entrega del sistema administrativo.
 * NO guardan precios.
 */

const ESTADOS_REP = { en_proceso: 'En proceso', culminado: 'Culminado', cancelado: 'Cancelado' };
// Culminado (vehículo listo, probado y entregado) y Cancelado (el cliente lo retiró sin reparar)
// son estados FINALES: la reparación queda bloqueada y no se pueden cambiar sus ítems.
const esCerrada = (r) => r && (r.estado === 'culminado' || r.estado === 'cancelado');
const numRep = (n) => '#' + String(n || 0).padStart(4, '0');
const siguienteNumeroRep = () => Math.max(0, ...(db.reparaciones || []).map((r) => r.numero || 0)) + 1;

// ---------- Correcciones (versiones) ----------
// Una reparación culminada o cancelada nunca se modifica. Si se cerró con un error, el
// administrador crea una CORRECCIÓN: una nueva versión con el mismo número que reemplaza a
// la anterior. La versión anterior queda guardada tal cual (bloqueada) como historial.
const reemplazoDe = (r) => (db.reparaciones || []).find((x) => x.reemplazaA === r.id) || null;
const numRepV = (r) => numRep(r.numero) + ((r.version || 1) > 1 ? ` v${r.version}` : '');
const vigente = (r) => !reemplazoDe(r);

async function corregirReparacion(r) {
  if (soloLectura() || !esCerrada(r)) return;
  if (reemplazoDe(r)) { toast('Esta reparación ya tiene una corrección'); return; }
  if (repDirty && !await confirmarSinGuardar()) return;
  const motivo = await pedirDato({
    titulo: `Corregir ${tipoRep(r).toLowerCase()} ${numRep(r.numero)}`,
    texto: 'Se creará una nueva versión con el mismo número para corregir el error. La versión actual se conserva sin cambios como historial y deja de mostrarse en el listado.',
    etiqueta: 'Motivo de la corrección', placeholder: 'Ej: se cerró sin el ítem de alineación', boton: 'Crear corrección',
  });
  if (!motivo) return;
  const ahora = new Date().toISOString();
  const nueva = {
    ...JSON.parse(JSON.stringify(r)),
    id: uid(), version: (r.version || 1) + 1, reemplazaA: r.id, motivoCorreccion: motivo.slice(0, 500),
    estado: 'en_proceso', fechaCierre: null, cerradoPor: '',
    corregidoPor: (typeof Nube !== 'undefined' && Nube.perfil?.nombre) || '', fechaCorreccion: hoyISO(),
    creado: ahora, actualizado: ahora,
  };
  db.reparaciones.push(nueva);
  repDirty = false;
  await guardar();
  toast(`Corrección creada: ${numRepV(nueva)}. Ajusta lo necesario y vuelve a cerrarla.`);
  abrirReparacion(nueva.id);
}

// Historial de versiones (se muestra en el editor cuando hay más de una)
function historialVersionesHTML(r) {
  const cadena = [];
  let x = r; while (x?.reemplazaA) { x = db.reparaciones.find((y) => y.id === x.reemplazaA); if (x) cadena.unshift(x); }
  cadena.push(r);
  let s = reemplazoDe(r); while (s) { cadena.push(s); s = reemplazoDe(s); }
  if (cadena.length < 2) return '';
  return `<div class="rep-versiones"><strong>Historial de versiones</strong><ul>${cadena.map((v) => `<li>${v.id === r.id ? '<strong>' : `<a href="#" data-rep="ver-version" data-vid="${v.id}">`}Versión ${v.version || 1}${v.id === r.id ? ' (esta)</strong>' : '</a>'}
    · ${ESTADOS_REP[v.estado]}${v.fechaCierre ? ' el ' + fmtFecha(v.fechaCierre) : ''}${v.notaEntrega ? ' · Nota de entrega ' + esc(v.notaEntrega) : ''}
    ${v.motivoCorreccion ? `<br><small>Corrección${v.fechaCorreccion ? ' del ' + fmtFecha(v.fechaCorreccion) : ''}${v.corregidoPor ? ' por ' + esc(v.corregidoPor) : ''}: ${esc(v.motivoCorreccion)}</small>` : ''}
    ${reemplazoDe(v) ? '' : ' <span class="estado-rep en_proceso" style="font-size:.75em">vigente</span>'}</li>`).join('')}</ul></div>`;
}

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
  if (esCerrada(rep)) return rep; // una reparación cerrada nunca se modifica
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
  $('#rep-contador').textContent = db.reparaciones.filter((r) => r.estado === 'en_proceso' && vigente(r)).length || '';
  if (!$('#tabla-rep')) return;
  const q = norm($('#buscar-rep').value).trim();
  const filtro = $('#filtro-rep').value;
  const lista = db.reparaciones
    .filter(vigente)
    .filter((r) => !filtro || r.estado === filtro)
    .filter((r) => !q || norm([numRep(r.numero), r.cliente, r.telefono, r.vehiculo, r.tecnico, r.notaEntrega, ...r.items.map((i) => i.desc)].join(' ')).includes(q))
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('#tabla-rep').innerHTML = lista.map((r) => {
    const ap = r.items.filter((i) => i.estado === 'aprobado').length;
    const re = r.items.length - ap;
    return `<tr data-repid="${r.id}">
      <td><strong>${numRepV(r)}</strong>${r.reemplazaA ? '<br><small class="tipo-mod">Corrección</small>' : ''}${r.tipo === 'modificacion' ? '<br><small class="tipo-mod">Modificación</small>' : ''}</td>
      <td>${fmtFecha(r.fecha)}</td>
      <td>${esc(r.cliente || '—')}</td>
      <td>${esc(r.vehiculo || '—')}</td>
      <td>${esc(r.tecnico || '—')}</td>
      <td><span class="rv-mini rv-bueno" title="Aprobados">${ap}</span>${re ? `<span class="rv-mini rv-urgente" title="Rechazados, pendientes">${re}</span>` : ''}</td>
      <td>${esc(r.notaEntrega || '—')}</td>
      <td>${r.estado === 'en_proceso' && !soloLectura()
        ? `<button type="button" class="estado-rep estado-cambiar ${r.estado}" data-replista="estado" title="Cambiar estado">${ESTADOS_REP[r.estado]}</button>`
        : `<span class="estado-rep ${r.estado}">${ESTADOS_REP[r.estado]}</span>`}</td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-replista="editar" title="${soloLectura() ? 'Ver' : 'Modificar'}">${soloLectura() ? '👁' : '✏️'}</button>
        <button class="btn tiny ghost" data-replista="pdf">PDF</button>
        ${soloLectura() ? '' : '<button class="btn tiny ghost" data-replista="enlace" title="Enlace / QR del historial del cliente">QR</button>'}
      </td>
    </tr>`;
  }).join('');
  const v = $('#vacio-rep');
  v.hidden = lista.length > 0;
  v.textContent = db.reparaciones.length ? 'Ninguna reparación coincide con la búsqueda.' : 'Aún no hay reparaciones. Se crean al marcar un presupuesto como "Aprobado".';
}

// ===================== EDITOR =====================
let repEdit = null;
let repDirty = false;

// Las descripciones de los ítems crecen hacia abajo para mostrar textos largos completos
function ajustarAlturasRep() {
  requestAnimationFrame(() => $$('#rep-items-edit textarea[data-it="desc"]').forEach(autoAltura));
}

function mostrarEditorRep(si) {
  $('#rep-lista').hidden = si;
  $('#rep-editor').hidden = !si;
  window.scrollTo(0, 0);
  if (si) ajustarAlturasRep();
}

function abrirReparacion(id) {
  const r = (db.reparaciones || []).find((x) => x.id === id); if (!r) return;
  repEdit = JSON.parse(JSON.stringify(r)); repDirty = false;
  pintarEditorRep();
  mostrarEditorRep(true);
}

// Presupuestos creados a partir de los ítems rechazados de esta reparación
const presupuestosDerivados = (r) => (db.presupuestos || []).filter((p) => p.origen?.reparacionId === r.id);

// ---------- Tipo de trabajo y reparaciones manuales ----------
const TIPOS_REP = { reparacion: 'Reparación', modificacion: 'Modificación' };
const tipoRep = (r) => TIPOS_REP[r?.tipo] || 'Reparación';
// Las reparaciones manuales o creadas desde un diagnóstico (sin presupuesto) tienen ítems editables
const itemsManuales = (r) => !r.presupuestoId || !!r.reemplazaA; // las correcciones también
let repNueva = false;

// Nueva reparación manual (solo admin). pre: datos iniciales (p. ej. desde un diagnóstico)
async function nuevaReparacion(pre = {}) {
  if (repDirty && !await confirmarSinGuardar()) return;
  repEdit = {
    id: uid(), numero: 0, fecha: hoyISO(), tipo: 'reparacion', tecnico: '', notas: '', notaEntrega: '', estado: 'en_proceso',
    presupuestoId: null, presupuestoNumero: 0, vehiculoId: null, cliente: '', telefono: '', vehiculo: '',
    items: [{ cant: 1, unidad: 'Und.', desc: '', sku: '', estado: 'aprobado' }], ...pre,
  };
  if (repEdit.vehiculoId) asignarVehiculoRep(repEdit.vehiculoId);
  repNueva = true; repDirty = !!pre.items;
  pintarEditorRep();
  mostrarEditorRep(true);
}

function asignarVehiculoRep(vid) {
  const v = vehiculo(vid); if (!v) return;
  const c = cliente(v.clienteId);
  Object.assign(repEdit, { vehiculoId: v.id, cliente: c?.nombre || '', telefono: c?.telefono || '', vehiculo: `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''} · ${v.placa}` });
}

function clienteRepHTML(r) {
  if (r.vehiculoId && vehiculo(r.vehiculoId)) {
    return `<div class="seleccion rv-sel-cliente">
      <div><strong>${esc(r.cliente)}</strong> · ${esc(r.telefono)}<br>${esc(r.vehiculo)}</div>
      <div class="rv-sel-botones">
        <button type="button" class="btn small ghost" data-rep="otro-vehiculo">+ Otro vehículo de este cliente</button>
        <button type="button" class="btn small ghost" data-rep="cambiar-cliente">Cambiar</button>
      </div>
    </div>`;
  }
  if (r._otroDe && cliente(r._otroDe)) {
    const c = cliente(r._otroDe);
    return `<div class="seleccion rv-sel-cliente"><div><strong>${esc(c.nombre)}</strong> · ${esc(c.telefono)}<br><span class="hint">Nuevo vehículo para este cliente:</span></div>
      <button type="button" class="btn small ghost" data-rep="cambiar-cliente">Cancelar</button></div>
      <div id="rep-otro-veh" style="margin-top:8px">${camposVehiculoHTML(r._vehNuevo || {})}</div>`;
  }
  const n = r._nuevo || {};
  return `<input id="rep-buscar-cliente" type="search" placeholder="Buscar cliente registrado por nombre, teléfono o placa…" autocomplete="off">
    <div id="rep-res-cliente" class="picker-list"></div>
    ${camposClienteNuevoHTML(n, "rep-nuevo-cliente")}`;
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

// Ítems editables (reparaciones manuales o desde diagnóstico)
function itemsEditablesHTML(r) {
  return r.items.map((it, i) => `<tr data-ri="${i}">
    <td class="col-cant"><input data-it="cant" inputmode="decimal" value="${fmtCant(it.cant)}" aria-label="Cantidad">
      <select data-it="unidad" aria-label="Unidad">${[...new Set([...UNIDADES, it.unidad || 'Und.'])].map((u) => `<option ${u === it.unidad ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></td>
    <td><textarea data-it="desc" rows="1" placeholder="Descripción del trabajo o pieza">${esc(it.desc)}</textarea></td>
    <td><button type="button" class="rep-estado ${it.estado}" data-rep="toggle" title="Tocar para cambiar">${it.estado === 'aprobado' ? 'Aprobado' : 'Rechazado'}</button></td>
    <td><button type="button" class="btn tiny ghost" data-rep="quitar-item" title="Quitar">✕</button></td>
  </tr>`).join('');
}

function pintarEditorRep() {
  const r = repEdit;
  const cerrada = esCerrada(r);
  const bloqueada = cerrada || soloLectura(); // el rol taller solo puede ver
  const editarItems = !bloqueada && (repNueva || itemsManuales(r));
  const otro = r.tecnico && !tecnicos().includes(r.tecnico);
  const rechazados = r.items.filter((i) => i.estado === 'rechazado' && i.desc).length;
  const derivados = repNueva ? [] : presupuestosDerivados(r);
  $('#rep-editor').innerHTML = `
    <div class="card pres-toolbar">
      <button class="btn ghost" data-rep="volver">← Reparaciones</button>
      ${repNueva ? '<strong>Nueva reparación</strong>' : `<span class="estado-rep ${r.estado}">${ESTADOS_REP[r.estado]}</span>`}
      <span class="spacer"></span>
      ${!repNueva && r.presupuestoId ? '<button class="btn ghost" data-rep="presupuesto">Ver presupuesto</button>' : ''}
      ${!repNueva && rechazados ? '<button class="btn ghost" data-rep="nuevo-presupuesto">Crear otro presupuesto</button>' : ''}
      ${repNueva || cerrada ? '' : '<button class="btn danger" data-rep="borrar">Eliminar</button>'}
      ${!repNueva && cerrada && !soloLectura() && vigente(r) ? '<button class="btn ghost" data-rep="corregir" title="Crear una nueva versión con el mismo número">✎ Corregir (nueva versión)</button>' : ''}
      ${repNueva ? '' : '<button class="btn ghost" data-rep="pdf">⬇ PDF</button>'}
      ${!repNueva && !soloLectura() && vigente(r) ? `<button class="btn wa" data-rep="informar-equipo" title="Enviar al grupo del equipo los trabajos aprobados">${equipoInformadoRep(r) ? '✓ Equipo informado' : 'Informar al equipo'}</button>` : ''}
      ${!repNueva && !soloLectura() ? '<button class="btn ghost" data-rep="enlace" title="Enlace personal para que el cliente vea el historial de su vehículo">Enlace / QR</button>' : ''}
      <button class="btn primary" data-rep="guardar">Guardar</button>
    </div>
    ${repNueva ? `
      <div class="card">
        <h3 style="margin-top:0">Tipo de trabajo</h3>
        <div class="rv-tipos">${Object.entries(TIPOS_REP).map(([k, n]) => `<button type="button" class="rv-tipo ${r.tipo === k ? 'activo' : ''}" data-rep="tipo" data-tipo="${k}">${n}</button>`).join('')}</div>
        <fieldset style="margin-top:12px"><legend>Cliente y vehículo</legend><div id="rep-cliente">${clienteRepHTML(r)}</div></fieldset>
      </div>` : `
    ${!repNueva && reemplazoDe(r) ? `<div class="card rep-reemplazada">⚠ Esta versión fue <strong>reemplazada</strong> por una corrección (versión ${reemplazoDe(r).version || 2}). Se conserva solo como historial. <a href="#" data-rep="ver-version" data-vid="${reemplazoDe(r).id}">Ver versión vigente</a></div>` : ''}
    ${!repNueva && r.reemplazaA ? `<div class="card rep-correccion">✎ <strong>Versión ${r.version || 2}</strong>: corrige la versión anterior${r.motivoCorreccion ? ` — ${esc(r.motivoCorreccion)}` : ''}.</div>` : ''}
    <div class="card rep-estado-card">
      ${cerrada ? `
        <div class="rep-cerrada">🔒 ${tipoRep(r)} <strong>${r.estado === 'cancelado' ? 'cancelada' : 'culminada'}</strong>${r.fechaCierre ? ` el ${fmtFecha(r.fechaCierre)}` : ''}${r.cerradoPor ? ` por ${esc(r.cerradoPor)}` : ''}.
          Los ítems, el técnico y el estado ya no se pueden modificar. Solo puedes agregar notas y el número de nota de entrega.${!soloLectura() && vigente(r) ? ' Si se cerró con un error, usa <strong>Corregir (nueva versión)</strong>.' : ''}</div>`
      : `
        <div class="rep-estado-acciones">
          <span>Estado:</span>
          <button type="button" class="pres-est-b culminado" data-rep="culminar">✔ Culminado</button>
          <button type="button" class="pres-est-b cancelado" data-rep="cancelar">✖ Cancelado</button>
        </div>
        <p class="hint" style="margin:6px 0 0"><strong>Culminado:</strong> vehículo listo, probado y entregado (requiere el N° de nota de entrega). <strong>Cancelado:</strong> el cliente lo retiró sin reparar (todos los ítems pasan a "rechazado"). Ambos son definitivos.</p>
        ${editarItems ? `<div class="rv-tipos" style="margin-top:10px">${Object.entries(TIPOS_REP).map(([k, n]) => `<button type="button" class="rv-tipo ${r.tipo === k ? 'activo' : ''}" data-rep="tipo" data-tipo="${k}">${n}</button>`).join('')}</div>` : ''}`}
      ${repNueva ? '' : historialVersionesHTML(r)}
      ${derivados.length ? `<p class="hint" style="margin:8px 0 0">Presupuestos creados a partir de esta reparación: ${derivados.map((p) => `<a href="#" data-rep="abrir-pres" data-pid="${p.id}">${numPres(p.numero)}</a> (${ESTADOS_PRES[p.estado] || p.estado})`).join(', ')}</p>` : ''}
    </div>`}
    <form id="form-rep" class="doc doc-editor" autocomplete="off">
      <div class="doc-head">
        <img class="doc-logo" src="img/logo.png" alt="Jacks">
        <div class="doc-empresa">
          <div class="doc-nombre">${EMPRESA.nombre}</div>
          <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
        </div>
      </div>
      <div class="doc-numero">${tipoRep(r).toUpperCase()} ${repNueva ? '(nueva)' : numRepV(r)}${r.presupuestoNumero ? ` <small class="rep-sub">· Presupuesto ${numPres(r.presupuestoNumero)}</small>` : ''}</div>
      <div class="doc-box">
        <div class="doc-fila2"><div>CLIENTE: ${esc(r.cliente)}</div><div class="r">FECHA: ${fmtFecha(r.fecha)}</div></div>
        <div class="doc-fila2"><div>TELÉFONO: ${esc(r.telefono)}</div><div class="r">VEHÍCULO: ${esc(r.vehiculo)}</div></div>
        <div class="doc-fila2">
          ${bloqueada ? `<div>TÉCNICO: ${esc(r.tecnico)}</div>` : `<label>TÉCNICO: <select id="rep-tecnico">${opcionesTecnico(r.tecnico)}</select>
            <input id="rep-tecnico-otro" value="${otro ? esc(r.tecnico) : ''}" placeholder="Nombre" ${otro ? '' : 'hidden'}></label>`}
          <div class="r">ESTADO: <strong>${ESTADOS_REP[r.estado]}</strong></div>
        </div>
      </div>
      ${!repNueva && !soloLectura() && vigente(r) ? `<div class="rep-datos-acc">
        <button type="button" class="btn small ghost" data-rep="editar-datos">✎ Editar datos del cliente / vehículo</button>
        ${!(r.vehiculoId && vehiculo(r.vehiculoId)) ? '<span class="hint">Sin cliente registrado asociado: asígnalo para que aparezca en su historial y su QR.</span>' : ''}
      </div>` : ''}
      ${(r.cambiosDatos || []).length ? `<details class="rep-cambios"><summary>Cambios en los datos del cliente/vehículo (${r.cambiosDatos.length})</summary><ul>${r.cambiosDatos.map((c) => `<li>${fmtFecha(c.fecha)}${c.por ? ' · ' + esc(c.por) : ''}: antes «${esc(c.antes.cliente || '—')}» · ${esc(c.antes.telefono || '—')} · ${esc(c.antes.vehiculo || '—')}</li>`).join('')}</ul></details>` : ''}
      ${editarItems ? `
        <table class="doc-items rep-tabla rep-items-edit">
          <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>ESTADO</th><th></th></tr></thead>
          <tbody id="rep-items-edit">${itemsEditablesHTML(r)}</tbody>
        </table>
        <div class="doc-add"><button type="button" class="btn small ghost" data-rep="agregar-item">+ Agregar ítem</button></div>`
      : `
        <table class="doc-items rep-tabla">
          <thead><tr><th>CANTIDAD</th><th>DESCRIPCIÓN</th><th>SKU</th><th>ESTADO</th></tr></thead>
          <tbody>${itemsRepHTML(r, !bloqueada)}</tbody>
        </table>
        ${bloqueada ? '' : '<p class="hint">Toca el estado de un ítem para cambiarlo (por ejemplo, si el cliente aprueba después un ítem rechazado).</p>'}`}
      <div class="doc-obs" style="border-top:1px solid #111">
        <div class="lbl">Notas</div>
        <textarea id="rep-notas" rows="3" ${soloLectura() ? 'readonly' : ''} placeholder="Ej: garantía de 3 meses en piezas; reemplazo solo bujes, no muñones: el ruido continuará…">${esc(r.notas)}</textarea>
      </div>
      <div class="rep-nota-entrega">
        <label>N° de nota de entrega (sistema administrativo)
          <input id="rep-nota-entrega" value="${esc(r.notaEntrega)}" ${soloLectura() ? 'readonly' : ''} placeholder="Ej: 437" inputmode="numeric">
        </label>
      </div>
    </form>`;
  ajustarAlturasRep();
}

function leerEditorRep() {
  const r = repEdit; if (!r || !$('#rep-notas')) return;
  if ($('#rep-tecnico')) {
    const t = $('#rep-tecnico').value;
    r.tecnico = t === '__otro' ? $('#rep-tecnico-otro').value.trim() : t;
  }
  r.notas = $('#rep-notas').value.trim();
  r.notaEntrega = $('#rep-nota-entrega').value.trim();
  // Ítems editables
  const filas = $$('#rep-items-edit tr');
  if (filas.length || $('#rep-items-edit')) {
    r.items = filas.map((tr, i) => {
      const g = (n) => tr.querySelector(`[data-it="${n}"]`).value;
      const cant = parseDec(g('cant'));
      return { cant: Number.isFinite(cant) ? cant : 1, unidad: g('unidad'), desc: g('desc').trim(), sku: r.items[i]?.sku || '', estado: r.items[i]?.estado || 'aprobado' };
    });
  }
  // Cliente (nueva reparación)
  if (repNueva && !r.vehiculoId) {
    if (r._otroDe && $('#rep-otro-veh')) r._vehNuevo = leerCamposVehiculo($('#rep-otro-veh'));
    else { r._nuevo = {}; $$('#rep-nuevo-cliente [data-nuevo]').forEach((i) => (r._nuevo[i.dataset.nuevo] = i.value.trim())); }
  }
}

// Guarda una reparación nueva (manual o desde diagnóstico)
async function guardarReparacionNueva() {
  leerEditorRep();
  const r = repEdit;
  if (!r.vehiculoId && r._otroDe) {
    const vid = await crearVehiculoCliente(r._otroDe, r._vehNuevo || {}); if (!vid) return false;
    asignarVehiculoRep(vid);
  }
  if (!r.vehiculoId) {
    const d = r._nuevo || {};
    if (['nombre', 'telefono', 'marca', 'modelo', 'placa'].some((k) => !d[k])) { alert('Selecciona un cliente registrado o completa los datos del cliente nuevo (nombre, teléfono, marca, modelo y placa).'); return false; }
    if (soloDigitos(d.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos.'); return false; }
    const vid = await obtenerVehiculoNuevo(d); if (!vid) return false;
    asignarVehiculoRep(vid);
  }
  r.items = r.items.filter((it) => it.desc);
  if (!r.items.length) { alert('Agrega al menos un ítem a la reparación.'); r.items.push({ cant: 1, unidad: 'Und.', desc: '', sku: '', estado: 'aprobado' }); return false; }
  delete r._nuevo; delete r._otroDe; delete r._vehNuevo;
  r.numero = siguienteNumeroRep(); r.creado = new Date().toISOString(); r.actualizado = r.creado;
  if (!db.reparaciones) db.reparaciones = [];
  db.reparaciones.push(JSON.parse(JSON.stringify(r)));
  // Si viene de un diagnóstico, el diagnóstico queda cerrado y enlazado
  if (r.ingresoId) { const g = (db.ingresos || []).find((x) => x.id === r.ingresoId); if (g) { g.reparacionId = r.id; g.estado = 'cerrada'; } }
  repNueva = false; repDirty = false;
  await guardar();
  toast(`${tipoRep(r)} ${numRep(r.numero)} creada`);
  return true;
}

// Cierra una reparación como culminada o cancelada (definitivo).
// Culminado EXIGE el número de nota de entrega del sistema administrativo.
// Sirve desde el editor (aplica lo editado en pantalla) y desde el listado.
async function cerrarRep(id, estado) {
  const actual = db.reparaciones.find((x) => x.id === id); if (!actual) return false;
  if (esCerrada(actual)) { toast('Esta reparación ya estaba cerrada'); return false; }
  const enEditor = repEdit && repEdit.id === id;
  if (enEditor) leerEditorRep();
  let nota = ((enEditor ? repEdit.notaEntrega : actual.notaEntrega) || '').trim();
  if (estado === 'culminado' && !nota) {
    nota = await pedirDato({
      titulo: `Culminar reparación ${numRep(actual.numero)}`,
      texto: 'Para marcarla como culminada es obligatorio el número de la nota de entrega del sistema administrativo.',
      etiqueta: 'N° de nota de entrega', placeholder: 'Ej: 437', boton: 'Continuar',
    });
    if (!nota) return false;
  }
  const texto = estado === 'culminado'
    ? `¿Marcar la reparación ${numRep(actual.numero)} como CULMINADA (nota de entrega ${nota})?\n\nÚsalo cuando el vehículo esté listo, probado y entregado.\nDespués no se podrán modificar los ítems, el técnico ni el estado.`
    : `¿CANCELAR la reparación ${numRep(actual.numero)}?\n\nÚsalo cuando el cliente retiró el vehículo sin realizar la reparación.\nTodos los ítems pasarán a "Rechazado" y después no se podrá modificar.`;
  if (!await confirmar(texto)) return false;
  if (enEditor) {
    const r = repEdit;
    const mismosItems = actual.items.length === r.items.length && actual.items.every((it, i) => it.desc === r.items[i].desc);
    if (mismosItems) actual.items.forEach((it, i) => (it.estado = r.items[i].estado));
    Object.assign(actual, { tecnico: r.tecnico, notas: r.notas });
  }
  if (estado === 'cancelado') actual.items.forEach((it) => (it.estado = 'rechazado'));
  Object.assign(actual, {
    notaEntrega: nota, estado,
    fechaCierre: hoyISO(), cerradoPor: (typeof Nube !== 'undefined' && Nube.perfil?.nombre) || '', actualizado: new Date().toISOString(),
  });
  repDirty = false;
  await guardar();
  toast(`Reparación ${numRep(actual.numero)} ${estado === 'culminado' ? 'culminada' : 'cancelada'}`);
  return true;
}

// Nuevo presupuesto con los ítems rechazados (por si el cliente vuelve por ellos)
function presupuestoDesdeReparacion(r) {
  const p0 = (db.presupuestos || []).find((p) => p.id === r.presupuestoId);
  const ref = p0?.aprobacion?.items || [];
  const items = r.items.filter((it) => it.estado === 'rechazado').map((it) => {
    const previo = ref.find((x) => x.desc === it.desc);
    return { cant: it.cant, unidad: it.unidad, desc: it.desc, sku: it.sku, precio: previo && Number.isFinite(previo.precio) ? previo.precio : NaN };
  });
  if (!items.length) { toast('Esta reparación no tiene ítems rechazados'); return; }
  repEdit = null; repDirty = false; mostrarEditorRep(false);
  irSubtabPres('presupuestos');
  nuevoPresupuesto(r.vehiculoId, { items, origen: { reparacionId: r.id, presupuestoId: r.presupuestoId || null } });
  if (!r.vehiculoId && presEdit) {
    Object.assign(presEdit, { cliente: r.cliente, telefono: r.telefono, vehiculo: r.vehiculo });
    pintarEditor();
  }
  toast(`Presupuesto nuevo con ${items.length} ítem(s) rechazados de la reparación ${numRep(r.numero)}. Revisa los precios.`);
}

async function guardarReparacion(silencioso = false) {
  leerEditorRep();
  const r = repEdit;
  r.actualizado = new Date().toISOString();
  // Solo se actualizan los campos que se editan aquí, sobre la versión más reciente
  // (así nunca se pierden cambios hechos desde la aprobación del presupuesto)
  const actual = db.reparaciones.find((x) => x.id === r.id);
  if (actual && esCerrada(actual)) {
    // Cerrada: solo notas y nota de entrega
    Object.assign(actual, { notas: r.notas, notaEntrega: r.notaEntrega, actualizado: r.actualizado });
    repEdit = JSON.parse(JSON.stringify(actual));
  } else if (actual && itemsManuales(actual)) {
    // Manual o desde diagnóstico: ítems y tipo editables
    const items = r.items.filter((it) => it.desc);
    if (!items.length) { alert('La reparación debe tener al menos un ítem.'); return false; }
    Object.assign(actual, { tecnico: r.tecnico, notas: r.notas, notaEntrega: r.notaEntrega, tipo: r.tipo || 'reparacion', items, actualizado: r.actualizado });
    repEdit = JSON.parse(JSON.stringify(actual));
  } else if (actual) {
    Object.assign(actual, { tecnico: r.tecnico, notas: r.notas, notaEntrega: r.notaEntrega, actualizado: r.actualizado });
    const mismosItems = actual.items.length === r.items.length && actual.items.every((it, i) => it.desc === r.items[i].desc);
    if (mismosItems) actual.items.forEach((it, i) => (it.estado = r.items[i].estado));
    repEdit = JSON.parse(JSON.stringify(actual));
  }
  repDirty = false;
  await guardar();
  if (!silencioso) toast(`${tipoRep(r)} ${numRep(r.numero)} guardada`);
  return true;
}

async function volverAListaRep() {
  if (repDirty && !await confirmarSinGuardar()) return;
  repEdit = null; repDirty = false; repNueva = false;
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
    <div class="doc-numero">${tipoRep(r).toUpperCase()} ${numRepV(r)}${r.reemplazaA ? ' <small class="rep-sub">· Corrección</small>' : ''}${reemplazoDe(r) ? ' <small class="rep-sub">· Versión reemplazada</small>' : ''}</div>
    <div class="doc-box">
      <div class="doc-fila2"><div>CLIENTE: ${esc(r.cliente)}</div><div class="r">FECHA: ${fmtFecha(r.fecha)}</div></div>
      <div class="doc-fila2"><div>TELÉFONO: ${esc(r.telefono)}</div><div class="r">VEHÍCULO: ${esc(r.vehiculo)}</div></div>
      <div class="doc-fila2"><div>TÉCNICO: ${esc(r.tecnico)}</div><div class="r">${r.notaEntrega ? 'NOTA DE ENTREGA: ' + esc(r.notaEntrega) : ''}</div></div>
      <div class="doc-fila2"><div>ESTADO: ${ESTADOS_REP[r.estado]}${r.fechaCierre ? ' (' + fmtFecha(r.fechaCierre) + ')' : ''}</div><div class="r">${r.presupuestoNumero ? 'PRESUPUESTO: ' + numPres(r.presupuestoNumero) : ''}</div></div>
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
  $$('.subtab[data-prtab]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.prtab === 'reparaciones' && typeof presDirty !== 'undefined' && presDirty && !await confirmarSinGuardar()) return;
    if (b.dataset.prtab === 'presupuestos' && repDirty && !await confirmarSinGuardar()) return;
    if (b.dataset.prtab === 'reparaciones') presDirty = false; else repDirty = false;
    irSubtabPres(b.dataset.prtab);
  }));
  $('#buscar-rep').oninput = renderReparaciones;
  $('#filtro-rep').onchange = renderReparaciones;
  $('#tabla-rep').onclick = (e) => {
    const tr = e.target.closest('[data-repid]'); if (!tr) return;
    const r = db.reparaciones.find((x) => x.id === tr.dataset.repid); if (!r) return;
    const b = e.target.closest('[data-replista]');
    if (b?.dataset.replista === 'enlace') return abrirEnlaceDoc(r, 'reparaciones');
    if (b?.dataset.replista === 'pdf') return imprimirDocumento(docRepHTML(r), `Reparacion ${numRep(r.numero).slice(1)}${r.cliente ? ' - ' + r.cliente : ''}`);
    if (b?.dataset.replista === 'estado') {
      return menuEstado(b, Object.entries(ESTADOS_REP).map(([valor, texto]) => ({ valor, texto, clase: valor, actual: valor === r.estado })), async (nuevo) => {
        if (nuevo !== 'en_proceso' && await cerrarRep(r.id, nuevo)) renderReparaciones();
      });
    }
    abrirReparacion(r.id);
  };

  $('#btn-nueva-rep').onclick = () => nuevaReparacion();

  const ed = $('#rep-editor');
  // Cliente nuevo registrado desde el módulo común: se usa en la reparación
  ed.addEventListener('cliente-registrado', (e) => {
    if (!repEdit || !e.detail?.vid) return;
    leerEditorRep(); asignarVehiculoRep(e.detail.vid); delete repEdit._nuevo; delete repEdit._otroDe; repDirty = true;
    $('#rep-cliente').innerHTML = clienteRepHTML(repEdit);
  });
  ed.addEventListener('input', (e) => {
    if (e.target.id === 'rep-buscar-cliente') {
      const lista = buscarVehiculos(e.target.value).slice(0, 6);
      $('#rep-res-cliente').innerHTML = lista.map((v) => `<div class="resultado" data-pickrep="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong> <small>${esc(cliente(v.clienteId).telefono)}</small><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
      return;
    }
    if (e.target.dataset.it === 'desc') autoAltura(e.target); // el texto largo baja a la línea siguiente
    repDirty = true;
  });
  // Enter en un ítem: pasa al siguiente o agrega uno nuevo (Shift+Enter = salto de línea en el mismo ítem)
  ed.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const tr = e.target.closest('#rep-items-edit tr'); if (!tr || !e.target.matches('[data-it]')) return;
    e.preventDefault();
    const next = tr.nextElementSibling;
    if (next) { next.querySelector('[data-it="desc"]')?.focus(); return; }
    leerEditorRep(); repEdit.items.push({ cant: 1, unidad: 'Und.', desc: '', sku: '', estado: 'aprobado' }); repDirty = true; pintarEditorRep();
    $$('#rep-items-edit [data-it="desc"]').at(-1)?.focus();
  });
  ed.addEventListener('change', (e) => {
    repDirty = true;
    if (e.target.id === 'rep-tecnico') { const o = $('#rep-tecnico-otro'); o.hidden = e.target.value !== '__otro'; if (!o.hidden) o.focus(); }
  });
  ed.addEventListener('submit', (e) => e.preventDefault());
  ed.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pickrep]');
    if (pick && repEdit) { leerEditorRep(); asignarVehiculoRep(pick.dataset.pickrep); delete repEdit._otroDe; repDirty = true; pintarEditorRep(); return; }
    const b = e.target.closest('[data-rep]'); if (!b || !repEdit) return;
    switch (b.dataset.rep) {
      case 'volver': volverAListaRep(); break;
      case 'guardar':
        if (repNueva) { if (await guardarReparacionNueva()) volverAListaRep(); }
        else if (await guardarReparacion() !== false) volverAListaRep();
        break;
      case 'tipo': leerEditorRep(); repEdit.tipo = b.dataset.tipo; repDirty = true; pintarEditorRep(); break;
      case 'agregar-item':
        leerEditorRep(); repEdit.items.push({ cant: 1, unidad: 'Und.', desc: '', sku: '', estado: 'aprobado' }); repDirty = true; pintarEditorRep();
        $$('#rep-items-edit [data-it="desc"]').at(-1)?.focus();
        break;
      case 'quitar-item': leerEditorRep(); repEdit.items.splice(Number(b.closest('tr').dataset.ri), 1); repDirty = true; pintarEditorRep(); break;
      case 'cambiar-cliente':
        leerEditorRep(); Object.assign(repEdit, { vehiculoId: null, cliente: '', telefono: '', vehiculo: '' }); delete repEdit._otroDe; repDirty = true; pintarEditorRep(); break;
      case 'otro-vehiculo': {
        leerEditorRep();
        const cid = vehiculo(repEdit.vehiculoId)?.clienteId;
        Object.assign(repEdit, { vehiculoId: null, vehiculo: '', _otroDe: cid, _vehNuevo: {} }); repDirty = true; pintarEditorRep();
        $('#rep-otro-veh [data-veh="marca"]')?.focus();
        break;
      }
      case 'corregir': await corregirReparacion(repEdit); break;
      case 'ver-version': {
        e.preventDefault();
        if (repDirty && !await confirmarSinGuardar()) break;
        repDirty = false; abrirReparacion(b.dataset.vid);
        break;
      }
      case 'culminar':
      case 'cancelar': {
        const id = repEdit.id;
        if (await cerrarRep(id, b.dataset.rep === 'culminar' ? 'culminado' : 'cancelado')) abrirReparacion(id);
        break;
      }
      case 'nuevo-presupuesto':
        if (repDirty) await guardarReparacion(true);
        presupuestoDesdeReparacion(repEdit);
        break;
      case 'abrir-pres': {
        e.preventDefault();
        const pid = b.dataset.pid;
        repEdit = null; repDirty = false; mostrarEditorRep(false);
        irSubtabPres('presupuestos'); abrirPresupuesto(pid);
        break;
      }
      case 'toggle': {
        if (esCerrada(repEdit)) break;
        leerEditorRep();
        const it = repEdit.items[Number(b.closest('tr').dataset.ri)];
        it.estado = it.estado === 'aprobado' ? 'rechazado' : 'aprobado';
        repDirty = true; pintarEditorRep(); break;
      }
      case 'enlace': abrirEnlaceDoc(repEdit, 'reparaciones'); break;
      case 'informar-equipo':
        if (repDirty && !(await guardarReparacion(true))) break;
        await informarEquipoRep(repEdit);
        break;
      case 'editar-datos':
        if (repDirty && !(await guardarReparacion(true))) break;
        editarDatosRep(repEdit.id);
        break;
      case 'pdf':
        if (repDirty) await guardarReparacion(true);
        imprimirDocumento(docRepHTML(repEdit), `Reparacion ${numRep(repEdit.numero).slice(1)}${repEdit.cliente ? ' - ' + repEdit.cliente : ''}`);
        break;
      case 'presupuesto':
        if (repDirty && !await confirmarSinGuardar()) break;
        {
          // Se cierra la reparación para que no quede una copia vieja abierta
          const pid = repEdit.presupuestoId;
          repEdit = null; repDirty = false; mostrarEditorRep(false);
          irSubtabPres('presupuestos'); abrirPresupuesto(pid);
        }
        break;
      case 'borrar':
        if (esCerrada(repEdit)) { alert('Una reparación culminada o cancelada no se puede eliminar.'); break; }
        if (!await confirmar(`¿Eliminar la reparación ${numRep(repEdit.numero)}? El presupuesto aprobado se conserva.`)) break;
        db.reparaciones = db.reparaciones.filter((x) => x.id !== repEdit.id);
        db.presupuestos.forEach((p) => { if (p.reparacionId === repEdit.id) delete p.reparacionId; });
        repDirty = false; await guardar(); volverAListaRep(); toast('Reparación eliminada');
        break;
    }
  });

  window.addEventListener('beforeunload', (e) => { if (repDirty) { e.preventDefault(); e.returnValue = ''; } });
  renderReparaciones();
}


// ===================== INFORMAR AL EQUIPO =====================
// Igual que en el presupuesto aprobado: envía al grupo del equipo (WhatsApp) el vehículo,
// el técnico y SOLO los trabajos aprobados. Usa el mismo mensaje editable de Configuración.
// Queda registrado en "mensajes" (así funciona también con reparaciones cerradas).
const equipoInformadoRep = (r) => (db.mensajes || []).filter((m) => m.tipo === 'equipo-reparacion' && m.reparacionId === r.id).map((m) => m.fecha).sort().at(-1) || null;

function mensajeEquipoRep(r) {
  const v = r.vehiculoId && vehiculo(r.vehiculoId);
  const [modeloTxt, placaTxt] = (r.vehiculo || '').split(' · ');
  const aprobados = (r.items || []).filter((it) => it.estado === 'aprobado' && it.desc);
  return rellenarMensaje('aprobacionEquipo', {
    vehiculo: v ? `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}` : (modeloTxt || 'Vehículo'),
    placa: v?.placa || placaTxt || '',
    tecnico: r.tecnico || 'por asignar',
    items: aprobados.map((it) => `-${it.desc}`).join('\n'),
    numero: numRepV(r),
  }).replace(/ · \n/, '\n');
}

async function informarEquipoRep(r) {
  if (!(r.items || []).some((it) => it.estado === 'aprobado' && it.desc)) { avisar('Esta reparación no tiene trabajos aprobados para informar.'); return; }
  const previo = equipoInformadoRep(r);
  if (previo && !await confirmar(`El equipo ya fue informado de esta reparación el ${fmtFecha(previo)}. ¿Enviar el aviso otra vez?`, { si: 'Enviar otra vez' })) return;
  // El grupo no se puede abrir directo desde un enlace: se elige el grupo en WhatsApp
  abrirWhatsApp(null, mensajeEquipoRep(r));
  db.mensajes = db.mensajes || [];
  db.mensajes.push({ id: uid(), vehiculoId: r.vehiculoId || null, reparacionId: r.id, telefono: '', tipo: 'equipo-reparacion', texto: `Aviso al equipo · ${tipoRep(r).toLowerCase()} ${numRepV(r)}`, fecha: hoyISO(), creado: new Date().toISOString() });
  await guardar(false);
  if (repEdit && repEdit.id === r.id) pintarEditorRep();
  toast('Elige el grupo del equipo en WhatsApp y envía');
}

// ===================== DATOS DEL CLIENTE / VEHÍCULO (también en reparaciones cerradas) =====================
// Los ítems, el estado y el técnico de una reparación cerrada no cambian nunca; los datos del
// cliente y del vehículo sí (por si faltó la placa o el teléfono). Cada cambio queda registrado.
function editarDatosRep(id) {
  const r = (db.reparaciones || []).find((x) => x.id === id); if (!r) return;
  const sel = { vehiculoId: r.vehiculoId && vehiculo(r.vehiculoId) ? r.vehiculoId : null };
  const asociadoHTML = () => {
    const v = sel.vehiculoId && vehiculo(sel.vehiculoId);
    if (!v) return '<span class="hint">Sin cliente registrado asociado.</span>';
    const c = cliente(v.clienteId);
    return `<div class="seleccion rv-sel-cliente"><div>Asociado a: <strong>${esc(c?.nombre || '')}</strong> · ${esc(v.marca)} ${esc(v.modelo)} · <strong>${esc(v.placa)}</strong></div>
      <button type="button" class="btn tiny ghost" id="dr-quitar">Quitar asociación</button></div>`;
  };
  abrirModal(`
    <h3>Datos del cliente y del vehículo</h3>
    <p class="hint">${tipoRep(r)} ${numRepV(r)}. ${esCerrada(r) ? 'Está cerrada: los ítems, el estado y el técnico no cambian; ' : ''}aquí solo se corrigen los datos del cliente/vehículo. El cambio queda registrado.</p>
    <label>Asociar a un cliente registrado <span class="opt">(recomendado: así aparece en su historial y en su QR)</span>
      <input id="dr-buscar" type="search" placeholder="Buscar por nombre, teléfono o placa…" autocomplete="off"></label>
    <div id="dr-res" class="picker-list"></div>
    <div id="dr-asociado" style="margin:8px 0">${asociadoHTML()}</div>
    <div class="grid">
      <label>Cliente<input id="dr-cliente" value="${esc(r.cliente)}"></label>
      <label>Teléfono<input id="dr-telefono" value="${esc(r.telefono)}" inputmode="tel"></label>
      <label class="full">Vehículo (marca, modelo y placa)<input id="dr-vehiculo" value="${esc(r.vehiculo)}" placeholder="Ej: Toyota Hilux 2018 · AB123CD"></label>
    </div>
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn ghost" data-act="cerrar">Cancelar</button>
      <button type="button" class="btn primary" id="dr-guardar">Guardar datos</button>
    </div>`);
  const pintarAsociado = () => {
    $('#dr-asociado').innerHTML = asociadoHTML();
    const q = $('#dr-quitar'); if (q) q.onclick = () => { sel.vehiculoId = null; pintarAsociado(); };
  };
  pintarAsociado();
  $('#dr-buscar').oninput = (e) => {
    const lista = buscarVehiculos(e.target.value).slice(0, 6);
    $('#dr-res').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId)?.nombre || '')}</strong> <small>${esc(cliente(v.clienteId)?.telefono || '')}</small><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
  };
  $('#dr-res').onclick = (e) => {
    const p = e.target.closest('[data-pick]'); if (!p) return;
    const v = vehiculo(p.dataset.pick); const c = cliente(v.clienteId);
    sel.vehiculoId = v.id;
    $('#dr-cliente').value = c?.nombre || '';
    $('#dr-telefono').value = c?.telefono || '';
    $('#dr-vehiculo').value = `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''} · ${v.placa}`;
    $('#dr-res').innerHTML = ''; $('#dr-buscar').value = '';
    pintarAsociado();
  };
  $('#dr-guardar').onclick = async () => {
    const nuevo = { cliente: $('#dr-cliente').value.trim(), telefono: $('#dr-telefono').value.trim(), vehiculo: $('#dr-vehiculo').value.trim(), vehiculoId: sel.vehiculoId };
    const antes = { cliente: r.cliente || '', telefono: r.telefono || '', vehiculo: r.vehiculo || '', vehiculoId: r.vehiculoId || null };
    if (Object.keys(nuevo).every((k) => (nuevo[k] || '') === (antes[k] || ''))) { cerrarModal(); return; }
    const actual = db.reparaciones.find((x) => x.id === id); if (!actual) return;
    actual.cambiosDatos = [...(actual.cambiosDatos || []), { fecha: hoyISO(), por: (typeof Nube !== 'undefined' && Nube.perfil?.nombre) || '', antes }];
    Object.assign(actual, nuevo, { actualizado: new Date().toISOString() });
    repDirty = false;
    await guardar();
    cerrarModal();
    toast('Datos del cliente/vehículo actualizados');
    if (repEdit && repEdit.id === id) abrirReparacion(id); else renderReparaciones();
  };
}

initReparaciones();

/* Jacks4WD – Diagnóstico / Reparación / Modificación
 * Ingreso rápido de un vehículo para casos específicos: se elige el tipo, el cliente,
 * el motivo de ingreso y se describe el diagnóstico o el trabajo. Desde aquí se puede
 * crear un presupuesto o guardar directamente en Reparaciones (cada uno con su
 * numeración correlativa). Una línea de la descripción = un ítem.
 */

const TIPOS_ING = { diagnostico: 'Diagnóstico', reparacion: 'Reparación', modificacion: 'Modificación' };
const numIng = (n) => '#' + String(n || 0).padStart(4, '0');
const siguienteNumeroIng = () => Math.max(0, ...(db.ingresos || []).map((x) => x.numero || 0)) + 1;
const ingBloqueado = (x) => x && (x.estado === 'cerrada' || x.estado === 'cancelada');

let ingEdit = null;    // ingreso abierto en el formulario (null = se muestra el listado)
let ingNuevo = false;
let ingDirty = false;

function ingresoVacio() {
  return { id: uid(), numero: 0, fecha: hoyISO(), categoria: 'diagnostico', vehiculoId: null, motivo: '', descripcion: '', tecnico: '', estado: 'abierta' };
}

function datosVehIng(x) {
  const v = x.vehiculoId && vehiculo(x.vehiculoId); const c = v && cliente(v.clienteId);
  return { nombre: c?.nombre || '', telefono: c?.telefono || '', modelo: v ? `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}` : '', placa: v?.placa || '' };
}
const lineasIng = (x) => (x.descripcion || '').split('\n').map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);

// ===================== LISTADO =====================
function mostrarIngresos() {
  if (ingEdit) return pintarFormIng();
  const lista = [...(db.ingresos || [])].sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('#rv-ingreso').innerHTML = `
    <div class="card">
      <div class="form-head">
        <div>
          <h2>Diagnóstico / Reparación / Modificación</h2>
          <p class="hint" style="margin:0">Diagnóstico específico de un vehículo. Desde aquí puedes crear un presupuesto o pasarlo a una reparación (que podrás ajustar antes de guardar).</p>
        </div>
        <button type="button" class="btn primary" data-ing="nuevo">+ Nuevo diagnóstico</button>
      </div>
      <input id="ing-buscar" type="search" placeholder="Buscar por cliente, placa, motivo o número…">
      <div class="table-wrap">
        <table>
          <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Vehículo</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
          <tbody id="ing-tabla"></tbody>
        </table>
      </div>
      <p id="ing-vacio" class="vacio" ${lista.length ? 'hidden' : ''}>Aún no hay diagnósticos.</p>
    </div>`;
  renderTablaIng();
}

function renderTablaIng() {
  const tb = $('#ing-tabla'); if (!tb) return;
  const q = norm($('#ing-buscar')?.value || '').trim();
  const lista = [...(db.ingresos || [])]
    .filter((x) => { if (!q) return true; const d = datosVehIng(x); return norm([numIng(x.numero), d.nombre, d.placa, d.modelo, x.motivo].join(' ')).includes(q); })
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  tb.innerHTML = lista.map((x) => {
    const d = datosVehIng(x);
    return `<tr data-ingid="${x.id}">
      <td><strong>${numIng(x.numero)}</strong></td>
      <td>${fmtFecha(x.fecha)}</td>
      <td>${esc(d.nombre || '—')}</td>
      <td>${esc(d.modelo)} · ${esc(d.placa)}</td>
      <td>${esc(x.motivo)}</td>
      <td><span class="estado-rvs ${x.estado}">${ESTADOS_RVS[x.estado]}</span></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-ingl="editar" title="${ingBloqueado(x) ? 'Ver' : 'Modificar'}">${ingBloqueado(x) ? '👁' : '✏️'}</button>
        <button class="btn tiny ghost" data-ingl="pdf">PDF</button>
      </td>
    </tr>`;
  }).join('');
}

// ===================== FORMULARIO =====================
function abrirIngreso(id) {
  const x = (db.ingresos || []).find((i) => i.id === id); if (!x) return;
  ingEdit = JSON.parse(JSON.stringify(x)); ingNuevo = false; ingDirty = false;
  pintarFormIng();
}
function nuevoIngreso() {
  ingEdit = ingresoVacio(); ingNuevo = true; ingDirty = false;
  pintarFormIng();
}
function volverListaIng() {
  if (ingDirty && !confirm('El ingreso tiene cambios sin guardar. ¿Salir sin guardar?')) return;
  ingEdit = null; ingDirty = false;
  mostrarIngresos();
}

function clienteIngHTML(x) {
  if (x.vehiculoId && vehiculo(x.vehiculoId)) {
    const d = datosVehIng(x);
    return `<div class="seleccion rv-sel-cliente">
      <div><strong>${esc(d.nombre)}</strong> · ${esc(d.telefono)}<br>${esc(d.modelo)} · <strong>${esc(d.placa)}</strong></div>
      <div class="rv-sel-botones">
        <button type="button" class="btn small ghost" data-ing="otro-vehiculo">+ Otro vehículo de este cliente</button>
        <button type="button" class="btn small ghost" data-ing="cambiar-cliente">Cambiar</button>
      </div>
    </div>`;
  }
  if (x._otroDe && cliente(x._otroDe)) {
    const c = cliente(x._otroDe);
    return `<div class="seleccion rv-sel-cliente"><div><strong>${esc(c.nombre)}</strong> · ${esc(c.telefono)}<br><span class="hint">Nuevo vehículo para este cliente:</span></div>
      <button type="button" class="btn small ghost" data-ing="cambiar-cliente">Cancelar</button></div>
      <div id="ing-otro-veh" style="margin-top:8px">${camposVehiculoHTML(x._vehNuevo || {})}</div>`;
  }
  const n = x._nuevo || {};
  return `<input id="ing-buscar-cliente" type="search" placeholder="Buscar cliente registrado por nombre, teléfono o placa…" autocomplete="off">
    <div id="ing-res-cliente" class="picker-list"></div>
    <p class="hint rv-o">o registra un cliente nuevo (quedará guardado en el registro de clientes):</p>
    <div class="grid" id="ing-nuevo-cliente">
      <label>Nombre *<input data-nuevo="nombre" value="${esc(n.nombre || '')}"></label>
      <label>Teléfono *<input data-nuevo="telefono" value="${esc(n.telefono || '')}" placeholder="0414-1234567" inputmode="tel"></label>
      <label>Marca *<input data-nuevo="marca" value="${esc(n.marca || '')}" list="lista-marcas"></label>
      <label>Modelo *<input data-nuevo="modelo" value="${esc(n.modelo || '')}"></label>
      <label>Placa *<input data-nuevo="placa" class="upper" value="${esc(n.placa || '')}"></label>
      <label>Año <span class="opt">(opcional)</span><input data-nuevo="anio" value="${esc(n.anio || '')}" inputmode="numeric" maxlength="4"></label>
      <label>Color <span class="opt">(opcional)</span><input data-nuevo="color" value="${esc(n.color || '')}"></label>
    </div>`;
}

function pintarFormIng() {
  const x = ingEdit;
  const bloq = ingBloqueado(x);
  const pres = x.presupuestoId && (db.presupuestos || []).find((p) => p.id === x.presupuestoId);
  const rep = x.reparacionId && (db.reparaciones || []).find((r) => r.id === x.reparacionId);
  $('#rv-ingreso').innerHTML = `
    ${bloq ? `<div class="card rv-bloqueo">🔒 Este diagnóstico está <strong>${ESTADOS_RVS[x.estado].toLowerCase()}</strong>: no se puede modificar.
      ${esAdminUI() ? '<button type="button" class="btn small ghost" data-ing="reabrir">Reabrir</button>' : ''}</div>` : ''}
    <div class="card">
      <div class="form-head">
        <h2>${ingNuevo ? 'Nuevo diagnóstico' : `Diagnóstico ${numIng(x.numero)}`}</h2>
        <button type="button" class="btn small ghost" data-ing="volver">← Listado</button>
      </div>
      <fieldset><legend>Cliente y vehículo</legend><div id="ing-cliente">${clienteIngHTML(x)}</div></fieldset>
      <div class="grid">
        <label>Motivo de ingreso *<input id="ing-motivo" value="${esc(x.motivo)}" placeholder="Ej: instalar suspensión, ruido en tren delantero…"></label>
        <label>Técnico <span class="opt">(opcional)</span><select id="ing-tecnico">${opcionesTecnico(x.tecnico)}</select></label>
        <label>Fecha<input id="ing-fecha" type="date" value="${x.fecha}"></label>
      </div>
      <label class="full">Diagnóstico <span class="opt">(una línea por cada hallazgo o trabajo recomendado; cada línea será un ítem al pasarlo a presupuesto o reparación)</span>
        <textarea id="ing-desc" rows="6" placeholder="Ej:&#10;Bujes de meseta inferior agrietados&#10;Fuga en retén de cigüeñal&#10;Cambio de amortiguadores traseros">${esc(x.descripcion)}</textarea>
      </label>
      ${pres || rep || x.presupuestoId || x.reparacionId ? `<p class="hint">Generado: ${pres ? `presupuesto <a href="#" data-ing="ver-pres">${numPres(pres.numero)}</a>` : x.presupuestoId ? 'presupuesto (sin guardar)' : ''}${(pres || x.presupuestoId) && (rep || x.reparacionId) ? ' · ' : ''}${rep ? `reparación <a href="#" data-ing="ver-rep">${numRep(rep.numero)}</a>` : ''}</p>` : ''}
    </div>
    <div class="rv-barra">
      ${bloq ? '' : `
        ${ingNuevo ? '' : '<button type="button" class="btn ghost" data-ing="cancelar-ing">Cancelar diagnóstico</button>'}
        <button type="button" class="btn ghost" data-ing="presupuesto">Crear presupuesto</button>
        <button type="button" class="btn ghost" data-ing="reparacion">Pasar a reparación</button>
        <button type="button" class="btn primary" data-ing="guardar">Guardar</button>`}
      ${ingNuevo ? '' : '<button type="button" class="btn ghost" data-ing="pdf">⬇ PDF</button>'}
    </div>`;
  if (bloq) $$('#rv-ingreso input, #rv-ingreso select, #rv-ingreso textarea').forEach((el) => (el.disabled = true));
}

function leerFormIng() {
  const x = ingEdit; if (!x || !$('#ing-motivo')) return;
  x.motivo = $('#ing-motivo').value.trim();
  x.descripcion = $('#ing-desc').value.trim();
  x.fecha = $('#ing-fecha').value || hoyISO();
  const t = $('#ing-tecnico').value; if (t !== '__otro') x.tecnico = t;
  if (!x.vehiculoId && x._otroDe && $('#ing-otro-veh')) x._vehNuevo = leerCamposVehiculo($('#ing-otro-veh'));
  else if (!x.vehiculoId) { x._nuevo = {}; $$('#ing-nuevo-cliente [data-nuevo]').forEach((i) => (x._nuevo[i.dataset.nuevo] = i.value.trim())); }
}

async function guardarIngreso({ volver = true } = {}) {
  leerFormIng();
  const x = ingEdit;
  if (!x.vehiculoId && x._otroDe) {
    const vid = crearVehiculoCliente(x._otroDe, x._vehNuevo || {}); if (!vid) return false;
    x.vehiculoId = vid;
  }
  if (!x.vehiculoId) {
    const d = x._nuevo || {};
    if (['nombre', 'telefono', 'marca', 'modelo', 'placa'].some((k) => !d[k])) { alert('Selecciona un cliente registrado o completa los datos del cliente nuevo (nombre, teléfono, marca, modelo y placa).'); return false; }
    if (soloDigitos(d.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos.'); return false; }
    const vid = obtenerVehiculoNuevo(d); if (!vid) return false;
    x.vehiculoId = vid;
  }
  if (!x.motivo) { alert('Escribe el motivo de ingreso.'); $('#ing-motivo')?.focus(); return false; }
  delete x._nuevo; delete x._otroDe; delete x._vehNuevo;
  x.actualizado = new Date().toISOString();
  if (!db.ingresos) db.ingresos = [];
  if (ingNuevo) { x.numero = siguienteNumeroIng(); x.creado = x.actualizado; db.ingresos.push(JSON.parse(JSON.stringify(x))); }
  else { const i = db.ingresos.findIndex((y) => y.id === x.id); db.ingresos[i] = JSON.parse(JSON.stringify(x)); }
  ingNuevo = false; ingDirty = false;
  await guardar();
  toast(`Diagnóstico ${numIng(x.numero)} guardado`);
  if (volver) { ingEdit = null; mostrarIngresos(); }
  return true;
}

async function marcarEstadoIng(estado) {
  const g = db.ingresos.find((y) => y.id === ingEdit.id); if (!g) return;
  g.estado = estado; g.actualizado = new Date().toISOString();
  ingEdit = JSON.parse(JSON.stringify(g));
  await guardar();
}

// Crear presupuesto con una línea por cada línea de la descripción
async function presupuestoDesdeIngreso() {
  if (!(await guardarIngreso({ volver: false }))) return;
  const x = ingEdit;
  const lineas = lineasIng(x);
  const items = (lineas.length ? lineas : [x.motivo]).map((desc) => ({ cant: 1, unidad: /mano de obra|servicio/i.test(desc) ? 'Serv.' : 'Und.', desc, sku: '', precio: NaN }));
  irA('presupuestos'); irSubtabPres('presupuestos');
  nuevoPresupuesto(x.vehiculoId, { items });
  if (presEdit) {
    presEdit.ingresoId = x.id;
    const g = db.ingresos.find((y) => y.id === x.id); if (g) { g.presupuestoId = presEdit.id; g.estado = 'cerrada'; }
    await guardar(false);
  }
  ingEdit = null;
  toast(`Presupuesto creado desde el diagnóstico ${numIng(x.numero)}. Completa los precios y guárdalo.`);
}

// Pasar a reparación: abre una reparación NUEVA con los datos del diagnóstico, para
// ajustarla a mano (ítems, tipo, técnico, notas) antes de guardarla.
async function reparacionDesdeIngreso() {
  if (!(await guardarIngreso({ volver: false }))) return;
  const x = ingEdit;
  const lineas = lineasIng(x);
  ingEdit = null;
  irA('presupuestos'); irSubtabPres('reparaciones');
  nuevaReparacion({
    vehiculoId: x.vehiculoId, tecnico: x.tecnico, ingresoId: x.id,
    notas: `Diagnóstico ${numIng(x.numero)}: ${x.motivo}`,
    items: (lineas.length ? lineas : [x.motivo]).map((desc) => ({ cant: 1, unidad: /mano de obra|servicio/i.test(desc) ? 'Serv.' : 'Und.', desc, sku: '', estado: 'aprobado' })),
  });
  toast('Ajusta la reparación (ítems, tipo, técnico) y pulsa Guardar.');
}

function docIngHTML(x) {
  const d = datosVehIng(x);
  const lineas = lineasIng(x);
  return `<div class="doc doc-print">
    <div class="doc-head">
      <img class="doc-logo" src="img/logo.png" alt="Jacks">
      <div class="doc-empresa"><div class="doc-nombre">${EMPRESA.nombre}</div><div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div></div>
    </div>
    <div class="doc-numero">DIAGNÓSTICO ${numIng(x.numero)}</div>
    <div class="doc-box">
      <div class="doc-fila2"><div>CLIENTE: ${esc(d.nombre)}</div><div class="r">FECHA: ${fmtFecha(x.fecha)}</div></div>
      <div class="doc-fila2"><div>TELÉFONO: ${esc(d.telefono)}</div><div class="r">VEHÍCULO: ${esc(d.modelo)} · ${esc(d.placa)}</div></div>
      <div class="doc-fila2"><div>MOTIVO: ${esc(x.motivo)}</div><div class="r">${x.tecnico ? 'TÉCNICO: ' + esc(x.tecnico) : ''}</div></div>
    </div>
    <table class="doc-items"><thead><tr><th>#</th><th>DETALLE</th></tr></thead>
      <tbody>${lineas.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l)}</td></tr>`).join('')}</tbody></table>
  </div>`;
}

// ===================== EVENTOS =====================
function initIngresos() {
  if (!db.ingresos) db.ingresos = [];
  const c = $('#rv-ingreso');
  c.addEventListener('input', (e) => {
    if (e.target.id === 'ing-buscar') return renderTablaIng();
    if (e.target.id === 'ing-buscar-cliente') {
      const lista = buscarVehiculos(e.target.value).slice(0, 6);
      $('#ing-res-cliente').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong> <small>${esc(cliente(v.clienteId).telefono)}</small><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
      return;
    }
    if (ingEdit) ingDirty = true;
  });
  c.addEventListener('change', (e) => {
    if (!ingEdit) return;
    ingDirty = true;
    if (e.target.id === 'ing-tecnico' && e.target.value === '__otro') {
      const n = (prompt('Nombre del técnico:', '') || '').trim();
      leerFormIng(); if (n) ingEdit.tecnico = n; pintarFormIng();
    }
  });
  c.addEventListener('click', async (e) => {
    const t = e.target;
    // Listado
    const fila = t.closest('[data-ingid]');
    if (fila && !ingEdit) {
      const x = db.ingresos.find((y) => y.id === fila.dataset.ingid); if (!x) return;
      if (t.closest('[data-ingl="pdf"]')) return imprimirDocumento(docIngHTML(x), `Diagnóstico ${numIng(x.numero).slice(1)} - ${datosVehIng(x).nombre}`);
      return abrirIngreso(x.id);
    }
    if (!ingEdit && !t.closest('[data-ing="nuevo"]')) return;
    const x = ingEdit;
    const cat = t.closest('[data-cat]');
    if (cat && !ingBloqueado(x)) { leerFormIng(); x.categoria = cat.dataset.cat; ingDirty = true; pintarFormIng(); return; }
    const pick = t.closest('[data-pick]');
    if (pick && !ingBloqueado(x)) { leerFormIng(); x.vehiculoId = pick.dataset.pick; ingDirty = true; $('#ing-cliente').innerHTML = clienteIngHTML(x); return; }
    const b = t.closest('[data-ing]'); if (!b) return;
    switch (b.dataset.ing) {
      case 'nuevo': nuevoIngreso(); break;
      case 'volver': volverListaIng(); break;
      case 'guardar': await guardarIngreso(); break;
      case 'presupuesto': await presupuestoDesdeIngreso(); break;
      case 'reparacion': await reparacionDesdeIngreso(); break;
      case 'pdf': imprimirDocumento(docIngHTML(x), `Diagnóstico ${numIng(x.numero).slice(1)} - ${datosVehIng(x).nombre}`); break;
      case 'cambiar-cliente': leerFormIng(); x.vehiculoId = null; delete x._otroDe; ingDirty = true; $('#ing-cliente').innerHTML = clienteIngHTML(x); break;
      case 'otro-vehiculo': leerFormIng(); x._otroDe = vehiculo(x.vehiculoId)?.clienteId; x._vehNuevo = {}; x.vehiculoId = null; ingDirty = true; $('#ing-cliente').innerHTML = clienteIngHTML(x); break;
      case 'cancelar-ing':
        if (!confirm('¿Cancelar este ingreso? Después no se podrá modificar.')) break;
        await marcarEstadoIng('cancelada'); ingEdit = null; mostrarIngresos(); break;
      case 'reabrir':
        if (!confirm('¿Reabrir este ingreso para modificarlo?')) break;
        await marcarEstadoIng('abierta'); pintarFormIng(); break;
      case 'ver-pres': e.preventDefault(); { const id = x.presupuestoId; ingEdit = null; irA('presupuestos'); irSubtabPres('presupuestos'); abrirPresupuesto(id); } break;
      case 'ver-rep': e.preventDefault(); { const id = x.reparacionId; ingEdit = null; irA('presupuestos'); irSubtabPres('reparaciones'); abrirReparacion(id); } break;
    }
  });
  window.addEventListener('beforeunload', (e) => { if (ingDirty) { e.preventDefault(); e.returnValue = ''; } });
}

function renderIngresos() { if (!ingEdit && !$('#rv-ingreso').hidden) mostrarIngresos(); }

initIngresos();

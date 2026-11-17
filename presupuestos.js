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

// ===================== PLANTILLAS DE PRESUPUESTO =====================
// Presupuestos pre-armados (se editan en ⚙ Configuración → Plantillas).
// Solo agregan los nombres de los ítems; cantidades y precios se completan a mano.
const PLANTILLAS_PRES_INICIALES = [
  { id: 'pl_entonacion_basica', nombre: 'Entonación básica', items: [
    'Limpieza de inyectores', 'Bujías', 'Filtro de gasolina', 'Filtro de aire',
    'Limpieza de cuerpo de aceleración', 'Mano de obra',
  ] },
];
function plantillasPres() {
  if (!db.config) db.config = {};
  if (!Array.isArray(db.config.plantillasPres)) db.config.plantillasPres = JSON.parse(JSON.stringify(PLANTILLAS_PRES_INICIALES));
  return db.config.plantillasPres;
}

function aplicarPlantilla(id) {
  const pl = plantillasPres().find((x) => x.id === id); if (!pl) return;
  leerEditor();
  const nuevos = pl.items.map((desc) => ({ ...itemVacio(), desc, unidad: /mano de obra|servicio/i.test(desc) ? 'Serv.' : 'Und.' }));
  // Si solo hay líneas vacías, se reemplazan; si no, se agregan al final
  const conDatos = presEdit.items.filter((it) => it.desc || Number.isFinite(it.precio));
  presEdit.items = [...conDatos, ...nuevos];
  presDirty = true;
  $('#pres-items').innerHTML = presEdit.items.map(filaHTML).join('');
  actualizarTotales();
  $$('#pres-items textarea[name="desc"]').forEach(autoAltura);
  toast(`Plantilla "${pl.nombre}" agregada: completa cantidades y precios`);
}

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
      <td class="num"><strong>${fmtUSD(totalesPres(p).total)}</strong>${p.estado === 'aprobado' && p.aprobacion ? `<br><small class="hint">Aprobado: ${fmtUSD(totalesPres({ items: p.aprobacion.items.filter((i) => i.aprobado) }).total)}</small>` : ''}</td>
      <td><button type="button" class="estado-pres estado-cambiar ${p.estado}" data-pact="estado-lista" data-pid="${p.id}" title="Cambiar estado">${ESTADOS_PRES[p.estado] || p.estado}</button></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-pact="editar-lista" data-pid="${p.id}" title="Modificar">✏️</button>
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
async function nuevoPresupuesto(vid = null, extra = null) {
  if (!(await confirmarSalida())) return;
  presEdit = {
    id: uid(), numero: siguienteNumero(), fecha: hoyISO(), estado: 'pendiente',
    vehiculoId: null, cliente: '', telefono: '', vehiculo: '', direccion: '',
    items: [itemVacio()], observaciones: CONDICIONES_PREDETERMINADAS,
  };
  presNuevo = true; presDirty = false; aprobEdit = null; presOtroDe = null;
  if (vid) asignarVehiculo(vid);
  if (extra?.items?.length) { presEdit.items = extra.items.map((it) => ({ ...itemVacio(), ...it })); presDirty = true; }
  if (extra?.revisionId) presEdit.revisionId = extra.revisionId;
  if (extra?.origen) presEdit.origen = extra.origen; // creado desde los rechazados de una reparación
  pintarEditor();
  mostrarEditor(true);
  const c = $('#form-pres [name="cliente"]'); if (c && !vid) c.focus();
}

function abrirPresupuesto(id) {
  const p = db.presupuestos.find((x) => x.id === id); if (!p) return;
  presEdit = JSON.parse(JSON.stringify(p));
  presEdit.items = presEdit.items.map((it) => ({ ...it, precio: it.precio ?? NaN }));
  if (!presEdit.items.length) presEdit.items.push(itemVacio());
  presNuevo = false; presDirty = false; aprobEdit = null; presOtroDe = null;
  pintarEditor();
  mostrarEditor(true);
}

// Cambiar el estado desde el listado, sin abrir todo el presupuesto.
// "Aprobado" abre el presupuesto con el panel para marcar qué ítems aprobó el cliente.
function cambiarEstadoDesdeLista(p, boton) {
  const rep = p.reparacionId && (db.reparaciones || []).find((r) => r.id === p.reparacionId);
  if (esCerrada(rep)) { toast(`Su reparación ${numRep(rep.numero)} ya está cerrada; el estado no se puede cambiar.`); return; }
  menuEstado(boton, Object.entries(ESTADOS_PRES).map(([valor, texto]) => ({ valor, texto, clase: valor, actual: valor === p.estado })), async (nuevo) => {
    if (nuevo === 'aprobado') { abrirPresupuesto(p.id); iniciarAprobacion(); return; }
    if (p.estado === 'aprobado' && p.reparacionId && !await confirmar(`El presupuesto pasará a "${ESTADOS_PRES[nuevo]}". La reparación ya creada se conserva. ¿Continuar?`)) return;
    p.estado = nuevo;
    await guardar();
    toast(`Presupuesto ${numPres(p.numero)} marcado como ${ESTADOS_PRES[nuevo].toLowerCase()}`);
  });
}

// "Informar al equipo": mensaje al grupo con el vehículo, el técnico y SOLO los ítems aprobados
// (los rechazados quedan en el registro pero no se envían). Texto editable en Configuración.
function mensajeAprobacionEquipo(p) {
  const v = p.vehiculoId && vehiculo(p.vehiculoId);
  const [modeloTxt, placaTxt] = (p.vehiculo || '').split(' · ');
  const aprobados = (p.aprobacion?.items || []).filter((it) => it.aprobado);
  return rellenarMensaje('aprobacionEquipo', {
    vehiculo: v ? `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}` : (modeloTxt || 'Vehículo'),
    placa: v?.placa || placaTxt || '',
    tecnico: p.aprobacion?.tecnico || 'por asignar',
    items: aprobados.map((it) => `-${it.desc}`).join('\n'),
    numero: numPres(p.numero),
  }).replace(/ · \n/, '\n');
}

async function informarEquipoAprobacion(p) {
  if (!p?.aprobacion) return;
  // El grupo no se puede abrir directo desde un enlace: se elige el grupo en WhatsApp
  abrirWhatsApp(null, mensajeAprobacionEquipo(p));
  const g = db.presupuestos.find((x) => x.id === p.id);
  if (g?.aprobacion) { g.aprobacion.equipoInformado = hoyISO(); p.aprobacion.equipoInformado = g.aprobacion.equipoInformado; }
  await guardar(false);
  pintarPanelEstado();
  toast('Elige el grupo del equipo en WhatsApp y envía');
}

// Aviso cuando el presupuesto se creó a partir de los ítems rechazados de una reparación
function origenPresHTML() {
  const o = presEdit?.origen; if (!o?.reparacionId) return '';
  const rep = (db.reparaciones || []).find((r) => r.id === o.reparacionId);
  const p0 = o.presupuestoId && db.presupuestos.find((p) => p.id === o.presupuestoId);
  return `<div class="pres-origen">Creado a partir de los ítems rechazados de la reparación <strong>${rep ? numRep(rep.numero) : '(eliminada)'}</strong>${p0 ? ` (presupuesto original ${numPres(p0.numero)})` : ''}.</div>`;
}

// Cliente registrado seleccionado + opción de agregarle otro vehículo
let presOtroDe = null;
function vehiculoRegistradoHTML() {
  if (!presEdit) return '';
  if (presOtroDe && cliente(presOtroDe)) {
    const c = cliente(presOtroDe);
    return `<div class="seleccion" style="margin-top:8px">
      <strong>${esc(c.nombre)}</strong> · nuevo vehículo
      <div id="pres-otro-veh" style="margin-top:8px">${camposVehiculoHTML()}</div>
      <div class="actions" style="justify-content:flex-start;margin-top:6px">
        <button type="button" class="btn small primary" data-pact="otro-veh-guardar">Agregar vehículo</button>
        <button type="button" class="btn small ghost" data-pact="otro-veh-cancelar">Cancelar</button>
      </div>
    </div>`;
  }
  const v = presEdit.vehiculoId && vehiculo(presEdit.vehiculoId);
  if (!v) return '';
  const c = cliente(v.clienteId);
  return `<div class="seleccion pres-veh-sel" style="margin-top:8px">
    <span>Cliente registrado: <strong>${esc(c?.nombre || '')}</strong> · ${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.placa)}</span>
    <button type="button" class="btn tiny ghost" data-pact="otro-veh">+ Otro vehículo de este cliente</button>
  </div>`;
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
      <span class="estado-pres ${p.estado}">${ESTADOS_PRES[p.estado] || ''}</span>
      <span class="spacer"></span>
      ${presNuevo ? '' : '<button class="btn ghost" data-pact="duplicar">Duplicar</button><button class="btn danger" data-pact="borrar">Eliminar</button>'}
      <button class="btn ghost" data-pact="pdf">⬇ PDF</button>
      <button class="btn wa" data-pact="wa">WhatsApp</button>
      <button class="btn primary" data-pact="guardar">Guardar</button>
    </div>

    <div class="card pres-buscar">
      <div class="pres-plantilla">
        <label>Usar plantilla <span class="opt">(opcional)</span>
          <select id="pres-plantilla">
            <option value="">— Presupuesto libre —</option>
            ${plantillasPres().map((pl) => `<option value="${esc(pl.id)}">${esc(pl.nombre)} (${pl.items.length} ítems)</option>`).join('')}
          </select>
        </label>
      </div>
      <input id="pres-buscar" type="search" placeholder="Opcional: buscar cliente registrado por nombre, teléfono o placa para llenar sus datos…" autocomplete="off">
      <div id="pres-res" class="picker-list"></div>
      <div id="pres-veh-registrado">${vehiculoRegistradoHTML()}</div>
    </div>

    ${origenPresHTML()}
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
        <label class="obs-garantia"><input type="checkbox" name="garantia" ${p.sinGarantia ? '' : 'checked'}> Incluir el enlace «Haz clic aquí para verificar nuestra póliza de garantías» <a href="${esc(urlGarantias())}" target="_blank" rel="noopener">(ver póliza)</a></label>
      </div>
    </form>
    <div id="pres-estado-panel"></div>`;
  actualizarTotales();
  pintarPanelEstado();
}

// ===================== ESTADO Y APROBACIÓN =====================
// La aprobación guarda los ítems tal como los aprobó el cliente (se pueden ajustar
// cantidades y precios, p. ej. la mano de obra) sin tocar el presupuesto original.
let aprobEdit = null; // copia de trabajo mientras se marca la aprobación

function opcionesTecnico(actual) {
  const lista = typeof tecnicos === 'function' ? tecnicos() : [];
  const otro = actual && !lista.includes(actual);
  return `<option value="">Selecciona…</option>${lista.map((t) => `<option ${t === actual ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__otro" ${otro ? 'selected' : ''}>Otro…</option>`;
}

function panelAprobacionHTML() {
  const a = aprobEdit;
  const todos = a.items.length && a.items.every((it) => it.aprobado);
  const otro = a.tecnico && !(typeof tecnicos === 'function' ? tecnicos() : []).includes(a.tecnico);
  return `<div class="aprob">
    <h4>¿Qué aprobó el cliente?</h4>
    <label class="aprob-todo"><input type="checkbox" id="aprob-todo" ${todos ? 'checked' : ''}> Aprobar el presupuesto completo</label>
    <p class="hint">Marca los ítems aprobados. Puedes ajustar cantidad, descripción o precio (por ejemplo, la mano de obra si se reparan menos ítems). Los no marcados quedarán como <strong>"Rechazado – pendiente por reparación"</strong>.</p>
    <div class="table-wrap">
      <table class="aprob-tabla">
        <thead><tr><th></th><th>Cant.</th><th>Descripción</th><th class="num">Precio USD</th><th class="num">Total USD</th></tr></thead>
        <tbody>${a.items.map((it, i) => `<tr data-ai="${i}" class="${it.aprobado ? 'si' : 'no'}">
          <td><input type="checkbox" data-aprob ${it.aprobado ? 'checked' : ''} aria-label="Aprobado"></td>
          <td class="aprob-cant"><input name="cant" inputmode="decimal" value="${fmtCant(it.cant)}"> <small>${esc(it.unidad)}</small></td>
          <td><textarea name="desc" rows="1">${esc(it.desc)}</textarea></td>
          <td class="num"><input name="precio" class="num" inputmode="decimal" value="${Number.isFinite(it.precio) ? r2(it.precio).toFixed(2) : ''}"></td>
          <td class="num aprob-total">${fmtUSD(lineaTotal(it))}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="aprob-totales" id="aprob-totales"></div>
    <div class="grid" style="margin-top:10px">
      <label>Técnico asignado a la reparación *<select id="aprob-tecnico">${opcionesTecnico(a.tecnico)}</select></label>
      <label id="aprob-tecnico-otro-wrap" ${otro ? '' : 'hidden'}>Nombre del técnico<input id="aprob-tecnico-otro" value="${otro ? esc(a.tecnico) : ''}"></label>
    </div>
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn ghost" data-pact="aprob-cancelar">Cancelar</button>
      <button type="button" class="btn primary" data-pact="aprob-confirmar">Confirmar aprobación</button>
    </div>
  </div>`;
}

function totalesAprobacion() {
  if (!aprobEdit) return;
  const ap = aprobEdit.items.filter((it) => it.aprobado);
  const t = totalesPres({ items: ap });
  const el = $('#aprob-totales');
  if (el) el.innerHTML = `<span>${ap.length} de ${aprobEdit.items.length} ítem(s) aprobados</span>
    <span>Subtotal: <strong>${fmtUSD(t.subtotal)}</strong></span><span>IVA: <strong>${fmtUSD(t.iva)}</strong></span><span>Total aprobado: <strong>$${fmtUSD(t.total)}</strong></span>`;
  $$('.aprob-tabla tbody tr').forEach((tr, i) => {
    tr.className = aprobEdit.items[i].aprobado ? 'si' : 'no';
    tr.querySelector('.aprob-total').textContent = fmtUSD(lineaTotal(aprobEdit.items[i]));
  });
  const todo = $('#aprob-todo'); if (todo) todo.checked = aprobEdit.items.every((it) => it.aprobado);
}

function pintarPanelEstado() {
  const cont = $('#pres-estado-panel'); if (!cont || !presEdit) return;
  const p = presEdit;
  if (presNuevo) {
    cont.innerHTML = '<div class="card pres-estado"><h3>Estado del presupuesto</h3><p class="hint">Guarda el presupuesto para poder marcarlo como aprobado o rechazado.</p></div>';
    return;
  }
  // Si su reparación ya está culminada o cancelada, el estado y la aprobación quedan fijos
  const repCerrada = p.reparacionId && typeof esCerrada === 'function' && esCerrada((db.reparaciones || []).find((r) => r.id === p.reparacionId));
  if (repCerrada) {
    const rep = db.reparaciones.find((r) => r.id === p.reparacionId);
    const ap = (p.aprobacion?.items || []).filter((it) => it.aprobado);
    cont.innerHTML = `<div class="card pres-estado">
      <h3>Estado del presupuesto: <span class="estado-pres ${p.estado}">${ESTADOS_PRES[p.estado]}</span></h3>
      <div class="rep-cerrada">🔒 Su reparación ${numRep(rep.numero)} está <strong>${rep.estado === 'cancelado' ? 'cancelada' : 'culminada'}</strong>. La aprobación ya no se puede modificar.
        ${p.aprobacion ? `<br>Aprobado el ${fmtFecha(p.aprobacion.fecha)} · ${ap.length} de ${p.aprobacion.items.length} ítem(s) · Total aprobado $${fmtUSD(totalesPres({ items: ap }).total)}` : ''}</div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px"><button type="button" class="btn small primary" data-pact="ver-reparacion">Ver reparación</button>${p.aprobacion ? '<button type="button" class="btn small wa" data-pact="informar-equipo">Informar al equipo</button>' : ''}</div>
    </div>`;
    return;
  }
  const btn = (k) => `<button type="button" class="pres-est-b ${k} ${p.estado === k ? 'activo' : ''}" data-pact="estado" data-estado="${k}">${ESTADOS_PRES[k]}</button>`;
  let resumen = '';
  if (p.estado === 'aprobado' && p.aprobacion && !aprobEdit) {
    const ap = p.aprobacion.items.filter((it) => it.aprobado);
    const t = totalesPres({ items: ap });
    resumen = `<div class="pres-aprob-resumen">
      <div>Aprobado el <strong>${fmtFecha(p.aprobacion.fecha)}</strong> · ${ap.length} de ${p.aprobacion.items.length} ítem(s) · Total aprobado <strong>$${fmtUSD(t.total)}</strong>${p.aprobacion.tecnico ? ` · Técnico: ${esc(p.aprobacion.tecnico)}` : ''}</div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px">
        <button type="button" class="btn small wa" data-pact="informar-equipo">${p.aprobacion.equipoInformado ? 'Informar de nuevo al equipo' : 'Informar al equipo'}</button>
        <button type="button" class="btn small ghost" data-pact="aprob-modificar">Modificar aprobación</button>
        ${p.reparacionId ? '<button type="button" class="btn small primary" data-pact="ver-reparacion">Ver reparación</button>' : ''}
      </div>
    </div>`;
  }
  cont.innerHTML = `<div class="card pres-estado">
    <h3>Estado del presupuesto</h3>
    <div class="pres-est-botones">${btn('pendiente')}${btn('aprobado')}${btn('rechazado')}</div>
    ${resumen}
    ${aprobEdit ? panelAprobacionHTML() : ''}
  </div>`;
  if (aprobEdit) { totalesAprobacion(); $$('.aprob-tabla textarea').forEach(autoAltura); }
}

function iniciarAprobacion() {
  const p = presEdit;
  const rev = p.revisionId && db.revisiones?.find((r) => r.id === p.revisionId);
  if (p.aprobacion) aprobEdit = JSON.parse(JSON.stringify(p.aprobacion));
  else aprobEdit = { tecnico: rev?.tecnico || '', items: itemsUsados(p).map((it) => ({ cant: it.cant, unidad: it.unidad, desc: it.desc, sku: it.sku, precio: Number.isFinite(it.precio) ? it.precio : 0, aprobado: false })) };
  pintarPanelEstado();
  $('#pres-estado-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function leerTecnicoAprob() {
  const s = $('#aprob-tecnico'); if (!s) return aprobEdit.tecnico;
  return s.value === '__otro' ? $('#aprob-tecnico-otro').value.trim() : s.value;
}

async function confirmarAprobacion() {
  const repPrev = presEdit.reparacionId && (db.reparaciones || []).find((r) => r.id === presEdit.reparacionId);
  if (esCerrada(repPrev)) { alert('La reparación de este presupuesto ya está cerrada; la aprobación no se puede modificar.'); aprobEdit = null; pintarPanelEstado(); return; }
  aprobEdit.tecnico = leerTecnicoAprob();
  const ap = aprobEdit.items.filter((it) => it.aprobado);
  if (!ap.length) { alert('Marca al menos un ítem aprobado. Si el cliente no aprobó nada, marca el presupuesto como "Rechazado".'); return; }
  if (!aprobEdit.tecnico) { alert('Selecciona el técnico asignado a la reparación.'); $('#aprob-tecnico').focus(); return; }
  const p = presEdit;
  p.estado = 'aprobado';
  p.aprobacion = { ...aprobEdit, fecha: aprobEdit.fecha || hoyISO() };
  const rep = crearOActualizarReparacion(p);
  p.reparacionId = rep.id;
  aprobEdit = null;
  const g = db.presupuestos.find((x) => x.id === p.id);
  if (g) Object.assign(g, { estado: p.estado, aprobacion: JSON.parse(JSON.stringify(p.aprobacion)), reparacionId: p.reparacionId });
  await guardar();
  presDirty = false;
  volverALista();
  toast(`Presupuesto aprobado. Reparación ${numRep(rep.numero)} actualizada en la pestaña Reparaciones.`);
}

async function cambiarEstadoSimple(estado) {
  const p = presEdit;
  if (p.reparacionId && esCerrada((db.reparaciones || []).find((r) => r.id === p.reparacionId))) { alert('La reparación de este presupuesto ya está cerrada; el estado no se puede cambiar.'); return; }
  if (p.estado === 'aprobado' && p.reparacionId && !await confirmar(`El presupuesto pasará a "${ESTADOS_PRES[estado]}". La reparación ya creada se conserva en la pestaña Reparaciones. ¿Continuar?`)) return;
  p.estado = estado; aprobEdit = null;
  const g = db.presupuestos.find((x) => x.id === p.id); if (g) g.estado = estado;
  await guardar();
  presDirty = false;
  volverALista();
  toast(`Presupuesto marcado como ${ESTADOS_PRES[estado].toLowerCase()}`);
}

// Lee el formulario y las líneas hacia presEdit
function leerEditor() {
  const f = $('#form-pres'); if (!f || !presEdit) return;
  ['cliente', 'fecha', 'vehiculo', 'telefono', 'direccion', 'observaciones'].forEach((k) => (presEdit[k] = f[k].value.trim()));
  presEdit.sinGarantia = !f.garantia?.checked;
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

async function confirmarSalida() {
  if (!presDirty) return true;
  return await confirmarSinGuardar();
}

async function volverALista() {
  if (!(await confirmarSalida())) return;
  presEdit = null; presDirty = false;
  mostrarEditor(false);
  renderPresupuestos();
}

// Al entrar a la pestaña Presupuestos: cerrar editores sin cambios y mostrar los listados
function reiniciarVistaPresupuestos() {
  if (document.body.classList.contains('rol-taller') && typeof irSubtabPres === 'function') irSubtabPres('reparaciones');
  if (presEdit && !presDirty) { presEdit = null; aprobEdit = null; mostrarEditor(false); renderPresupuestos(); }
  if (typeof repEdit !== 'undefined' && repEdit && !repDirty) { repEdit = null; mostrarEditorRep(false); renderReparaciones(); }
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
    ${p.sinGarantia ? '' : `<div class="doc-garantia"><a href="${esc(urlGarantias())}">Haz clic aquí para verificar nuestra póliza de garantías</a><br><small>${esc(urlGarantias())}</small></div>`}
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
    ...(p.sinGarantia ? [] : ['', `Consulta nuestra póliza de garantías aquí: ${urlGarantias()}`]),
    '',
    'Quedamos atentos a tu aprobación. ¡Gracias por confiar en nosotros!',
    `— ${CONFIG.taller}`,
  ].join('\n');
}

async function enviarWhatsApp(p) {
  let tel = (p.telefono || '').trim();
  if (soloDigitos(tel).length < 10) {
    tel = (await pedirTexto('Número de WhatsApp del cliente (ej: 0414-1234567):', tel) || '').trim();
    if (!tel) return;
    if (soloDigitos(tel).length < 10) { alert('El número debe tener al menos 10 dígitos.'); return; }
    p.telefono = tel;
    const guardado = db.presupuestos.find((x) => x.id === p.id);
    if (guardado) guardado.telefono = tel;
    if (presEdit && presEdit.id === p.id) { const inp = $('#form-pres [name="telefono"]'); if (inp) inp.value = tel; }
  }
  abrirWhatsApp(tel, mensajePresupuesto(p));
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
    if (b?.dataset.pact === 'editar-lista') return abrirPresupuesto(p.id);
    if (b?.dataset.pact === 'estado-lista') return cambiarEstadoDesdeLista(p, b);
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
    // Panel de aprobación: editar cantidad, descripción o precio aprobados
    const fila = aprobEdit && e.target.closest('.aprob-tabla tr[data-ai]');
    if (fila) {
      const it = aprobEdit.items[Number(fila.dataset.ai)];
      if (e.target.name === 'cant') { const n = parseDec(e.target.value); it.cant = Number.isFinite(n) ? n : 0; }
      if (e.target.name === 'precio') { const n = parseDec(e.target.value); it.precio = Number.isFinite(n) ? n : 0; }
      if (e.target.name === 'desc') it.desc = e.target.value.trim();
      totalesAprobacion();
      return;
    }
    if (e.target.closest('#form-pres')) { presDirty = true; actualizarTotales(); }
  });
  ed.addEventListener('change', (e) => {
    if (aprobEdit && e.target.matches('[data-aprob]')) {
      aprobEdit.items[Number(e.target.closest('tr').dataset.ai)].aprobado = e.target.checked; totalesAprobacion(); return;
    }
    if (aprobEdit && e.target.id === 'aprob-todo') {
      aprobEdit.items.forEach((it) => (it.aprobado = e.target.checked));
      $$('.aprob-tabla [data-aprob]').forEach((c) => (c.checked = e.target.checked)); totalesAprobacion(); return;
    }
    if (e.target.id === 'aprob-tecnico') { $('#aprob-tecnico-otro-wrap').hidden = e.target.value !== '__otro'; aprobEdit.tecnico = leerTecnicoAprob(); return; }
    if (e.target.id === 'pres-plantilla') { if (e.target.value) aplicarPlantilla(e.target.value); e.target.value = ''; return; }
    if (e.target.closest('#form-pres')) { presDirty = true; actualizarTotales(); }
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
      presOtroDe = null; $('#pres-veh-registrado').innerHTML = vehiculoRegistradoHTML();
      return;
    }
    const b = e.target.closest('[data-pact]'); if (!b) return;
    if (b.dataset.pact === 'otro-veh') {
      presOtroDe = vehiculo(presEdit.vehiculoId)?.clienteId || null;
      $('#pres-veh-registrado').innerHTML = vehiculoRegistradoHTML();
      $('#pres-otro-veh [data-veh="marca"]')?.focus();
      return;
    }
    if (b.dataset.pact === 'otro-veh-cancelar') { presOtroDe = null; $('#pres-veh-registrado').innerHTML = vehiculoRegistradoHTML(); return; }
    if (b.dataset.pact === 'otro-veh-guardar') {
      const vid = await crearVehiculoCliente(presOtroDe, leerCamposVehiculo($('#pres-otro-veh')));
      if (!vid) return;
      leerEditor(); asignarVehiculo(vid); presDirty = true; presOtroDe = null;
      const f = $('#form-pres');
      ['cliente', 'telefono', 'vehiculo'].forEach((k) => (f[k].value = presEdit[k]));
      $('#pres-veh-registrado').innerHTML = vehiculoRegistradoHTML();
      toast('Vehículo agregado al cliente');
      return;
    }
    switch (b.dataset.pact) {
      case 'volver': volverALista(); break;
      case 'estado': {
        const est = b.dataset.estado;
        if (presDirty && !(await guardarPresupuesto(true))) break;
        if (est === 'aprobado') iniciarAprobacion(); else await cambiarEstadoSimple(est);
        break;
      }
      case 'aprob-modificar': iniciarAprobacion(); break;
      case 'informar-equipo': await informarEquipoAprobacion(presEdit); break;
      case 'aprob-cancelar': aprobEdit = null; pintarPanelEstado(); break;
      case 'aprob-confirmar': await confirmarAprobacion(); break;
      case 'ver-reparacion': if (await confirmarSalida()) { presDirty = false; irSubtabPres('reparaciones'); abrirReparacion(presEdit.reparacionId); } break;
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
      case 'guardar':
        // Al guardar se vuelve al listado; para aprobar/rechazar se abre desde ahí
        if (await guardarPresupuesto()) volverALista();
        break;
      case 'pdf': if (await guardarPresupuesto(true)) exportarPDF(presEdit); break;
      case 'wa': if (await guardarPresupuesto(true)) enviarWhatsApp(presEdit); break;
      case 'duplicar': {
        if (!(await confirmarSalida())) break;
        const base = JSON.parse(JSON.stringify(presEdit));
        presEdit = { ...base, id: uid(), numero: siguienteNumero(), fecha: hoyISO(), estado: 'pendiente', creado: undefined };
        presNuevo = true; presDirty = true;
        pintarEditor();
        toast(`Copia creada como ${numPres(presEdit.numero)} (sin guardar)`);
        break;
      }
      case 'borrar':
        if (await confirmar(`¿Eliminar el presupuesto ${numPres(presEdit.numero)}? Esto no se puede deshacer.`)) {
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

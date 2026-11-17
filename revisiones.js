/* Jacks4WD – Revisiones (básica de 17 puntos y completa)
 * Checklist con botones de un toque, técnico asignado, diagnóstico por WhatsApp y PDF,
 * y opción de crear un presupuesto a partir de la revisión (sin ser obligatorio).
 * Usa utilidades globales de app.js y presupuestos.js.
 */

// ===================== CONFIGURACIÓN =====================
// Los puntos de revisión y los técnicos se editan en ⚙ Configuración y se guardan
// en los datos (db.config). Estos son los valores iniciales.
const TECNICOS_INICIALES = ['Wilmer González', 'José Hernández'];

// Tipos de punto: normal (4 botones), vida (4 botones con % de vida),
// medida (4 botones + valor medido), traseras (pregunta si aplica la trasera),
// fugas (Sí/No + fluidos), fluidos (elegir fluidos; cada uno Nivel/Estado).
const TIPOS_PUNTO = {
  normal: 'Normal (4 botones)',
  vida: 'Con % de vida (frenos)',
  medida: 'Con valor medido',
  traseras: 'Pregunta "¿Aplica traseras?"',
  fugas: 'Fugas (Sí / No + fluidos)',
  fluidos: 'Nivel y estado de fluidos',
};

const CONFIG_REVISION_INICIAL = {
  basica: [
    { t: 'Tren delantero', items: [
      { k: 'bujes_mes_sup', n: 'Bujes de mesetas superiores', tipo: 'normal' },
      { k: 'munones_sup', n: 'Muñones superiores', tipo: 'normal' },
      { k: 'bujes_mes_inf', n: 'Bujes de mesetas inferiores', tipo: 'normal' },
      { k: 'munones_inf', n: 'Muñones inferiores', tipo: 'normal' },
      { k: 'terminales', n: 'Terminales y rótulas', tipo: 'normal' },
      { k: 'barras_link_del', n: 'Barras link delanteras', tipo: 'traseras', kTras: 'barras_link_tras', nTras: 'Barras link traseras' },
      { k: 'gomas_estab_del', n: 'Gomas de barra estabilizadora delanteras', tipo: 'traseras', kTras: 'gomas_estab_tras', nTras: 'Gomas de barra estabilizadora traseras' },
      { k: 'bujes_cajetin', n: 'Bujes de cajetín', tipo: 'normal' },
    ] },
    { t: 'Soportes y transmisión', items: [
      { k: 'bases_caja', n: 'Bases de caja', tipo: 'normal' },
      { k: 'bases_motor', n: 'Bases de motor', tipo: 'normal' },
      { k: 'rolineras_del', n: 'Rolineras delanteras', tipo: 'normal' },
      { k: 'rolineras_tras', n: 'Rolineras traseras', tipo: 'normal' },
      { k: 'crucetas', n: 'Crucetas de cardán', tipo: 'normal' },
    ] },
    { t: 'Frenos y cauchos', items: [
      { k: 'frenos_del', n: 'Frenos delanteros', tipo: 'vida' },
      { k: 'frenos_tras', n: 'Frenos traseros', tipo: 'vida' },
      { k: 'cauchos', n: 'Estado de cauchos', tipo: 'normal' },
    ] },
    { t: 'Fugas', items: [
      { k: 'fugas', n: 'Fugas de fluidos', tipo: 'fugas', sub: [
        { k: 'motor', n: 'Aceite de motor' }, { k: 'caja', n: 'Caja' }, { k: 'diferenciales', n: 'Diferenciales' },
        { k: 'transfer', n: 'Transfer' }, { k: 'refrigerante', n: 'Refrigerante' },
      ] },
    ] },
  ],
  completa: [
    { t: 'Revisión completa (adicional)', items: [
      { k: 'bujias', n: 'Bujías', tipo: 'normal' },
      { k: 'filtro_gasolina', n: 'Filtro de gasolina', tipo: 'normal' },
      { k: 'filtro_aire', n: 'Filtro de aire', tipo: 'normal' },
      { k: 'filtro_cabina', n: 'Filtro de cabina', tipo: 'normal' },
      { k: 'fluidos', n: 'Nivel y estado de fluidos', tipo: 'fluidos', sub: [
        { k: 'fluido_caja', n: 'Fluido de caja' },
        { k: 'fluido_dif_del', n: 'Fluido de diferencial delantero' },
        { k: 'fluido_dif_tras', n: 'Fluido de diferencial trasero' },
      ] },
      { k: 'presion_gasolina', n: 'Medición de presión de gasolina', tipo: 'medida', medida: 'Valor medido (psi)', naTexto: 'No es posible medir' },
      { k: 'compresion', n: 'Medición de compresión', tipo: 'medida', medida: 'Valores por cilindro (psi)' },
    ] },
  ],
};

const ESTADOS_RV = {
  reemplazo: { n: 'Reemplazo inmediato', titulo: 'REEMPLAZO INMEDIATO', cls: 'rv-urgente' },
  regular: { n: 'Estado regular', titulo: 'ESTADO REGULAR (revisar pronto)', cls: 'rv-regular' },
  bueno: { n: 'Buen estado', titulo: 'EN BUEN ESTADO', cls: 'rv-bueno' },
  na: { n: 'N/A', titulo: 'NO APLICA', cls: 'rv-na' },
};
const ORDEN_ESTADOS = ['reemplazo', 'regular', 'bueno', 'na'];

// Vida útil de las pastillas según el estado (puntos de tipo "vida")
const VIDA_FRENOS = { reemplazo: '-20%', regular: '45%', bueno: '+50%' };
const NIVEL_FLUIDO = { optimo: 'Óptimo', falta: 'Falta' };
const ESTADO_FLUIDO = { optimo: 'Óptimo', reemplazar: 'Reemplazar' };

const copiar = (x) => JSON.parse(JSON.stringify(x));

// Configuración vigente (se crea con los valores iniciales la primera vez)
function configRevision() {
  if (!db.config) db.config = {};
  if (!db.config.revision || !Array.isArray(db.config.revision.basica)) db.config.revision = copiar(CONFIG_REVISION_INICIAL);
  return db.config.revision;
}
function tecnicos() {
  if (!db.config) db.config = {};
  if (!Array.isArray(db.config.tecnicos) || !db.config.tecnicos.length) db.config.tecnicos = [...TECNICOS_INICIALES];
  return db.config.tecnicos;
}

// Convierte un punto de la configuración al formato que usa el checklist
function defDe(item) {
  const d = { k: item.k, n: item.n };
  if (item.naTexto) d.naTexto = item.naTexto;
  if (item.tipo === 'vida') d.vida = true;
  if (item.tipo === 'medida') d.medida = item.medida || 'Valor medido';
  if (item.tipo === 'traseras') d.traseras = { k: item.kTras || item.k + '_tras', n: item.nTras || item.n + ' (traseras)' };
  if (item.tipo === 'fugas') { d.fugas = true; d.fluidos = (item.sub || []).map((s) => [s.k, s.n]); }
  if (item.tipo === 'fluidos') d.selector = (item.sub || []).map((s) => ({ k: s.k, n: s.n, fluido: true }));
  return d;
}

// Cada revisión guarda una copia de los puntos con los que se hizo (rev.estructura),
// así editar la configuración no altera las revisiones ya guardadas.
const cacheEstructura = new WeakMap();
function estructuraDe(rev) {
  const e = rev.estructura || configRevision();
  if (!cacheEstructura.has(e)) {
    const conv = (secs) => (secs || []).map((s) => ({ t: s.t, items: (s.items || []).map(defDe) }));
    const basica = conv(e.basica); const completa = conv(e.completa);
    const defs = {};
    [...basica, ...completa].forEach((s) => s.items.forEach((d) => {
      defs[d.k] = d;
      if (d.traseras) defs[d.traseras.k] = d.traseras;
      (d.selector || []).forEach((x) => (defs[x.k] = x));
    }));
    cacheEstructura.set(e, { basica, completa, defs });
  }
  return cacheEstructura.get(e);
}

function nombreTipo(rev, tipo) {
  if (tipo === 'completa') return 'Revisión completa';
  const n = estructuraDe(rev).basica.reduce((a, s) => a + s.items.length, 0);
  return `Revisión básica (${n} puntos)`;
}

// ===================== MODELO =====================
const numRev = (n) => '#' + String(n || 0).padStart(4, '0');
const siguienteNumeroRev = () => Math.max(0, ...db.revisiones.map((r) => r.numero || 0)) + 1;
const seccionesDe = (rev) => { const e = estructuraDe(rev); return rev.tipo === 'completa' ? [...e.basica, ...e.completa] : e.basica; };

// Lista plana de puntos a evaluar según el tipo y las opciones elegidas
function puntosActivos(rev) {
  const out = [];
  seccionesDe(rev).forEach((sec) => sec.items.forEach((def) => {
    if (def.selector) {
      def.selector.forEach((sub) => { if ((rev.opciones.fluidos || []).includes(sub.k)) out.push({ ...sub, seccion: sec.t }); });
      return;
    }
    out.push({ ...def, seccion: sec.t });
    if (def.traseras && rev.opciones.traseras?.[def.k]) out.push({ ...def.traseras, seccion: sec.t });
  }));
  return out;
}

// Grupo del diagnóstico (reemplazo / regular / bueno / na) de un punto según su tipo
function grupoDe(def, it) {
  if (!it) return '';
  if (def?.fugas) {
    if (['si', 'reemplazo', 'regular'].includes(it.e)) return 'reemplazo';
    if (['no', 'bueno'].includes(it.e)) return 'bueno';
    return '';
  }
  if (def?.fluido) {
    if (!it.nivel && !it.estadoF) return '';
    if (it.estadoF === 'reemplazar') return 'reemplazo';
    if (it.nivel === 'falta') return 'regular';
    return 'bueno';
  }
  return it.e || '';
}
const estadoDe = (rev, k) => grupoDe(estructuraDe(rev).defs[k], rev.items[k]);

// "falta nivel, requiere reemplazo" / "nivel óptimo, estado óptimo"
function textoFluido(it) {
  const partes = [];
  if (it.nivel) partes.push(it.nivel === 'falta' ? 'falta nivel' : 'nivel óptimo');
  if (it.estadoF) partes.push(it.estadoF === 'reemplazar' ? 'requiere reemplazo' : 'estado óptimo');
  return partes.join(', ');
}

// Texto del estado para el diagnóstico y el PDF
function etiquetaEstado(def, it) {
  const g = grupoDe(def, it);
  if (def.fugas) return g === 'reemplazo' ? 'Fuga detectada' : 'Sin fugas';
  if (def.fluido) { const t = textoFluido(it); return t.charAt(0).toUpperCase() + t.slice(1); }
  if (def.vida && VIDA_FRENOS[g]) return `${ESTADOS_RV[g].n} (${VIDA_FRENOS[g]})`;
  return ESTADOS_RV[g]?.n || '';
}
function conteo(rev) {
  const c = { reemplazo: 0, regular: 0, bueno: 0, na: 0, pendientes: 0, total: 0 };
  puntosActivos(rev).forEach((p) => { c.total++; const e = estadoDe(rev, p.k); if (e) c[e]++; else c.pendientes++; });
  return c;
}

function detalleFugas(p, it) {
  const f = it?.fugas || {};
  return (p.fluidos || []).filter(([k]) => k in f).map(([k, n]) => (f[k] ? `${n} (${f[k]})` : n)).join(', ');
}
// Texto de detalle de un punto (medida, fugas, nota)
function detallePunto(p, it) {
  const partes = [];
  if (it.medida) partes.push(it.medida + (/\d$/.test(it.medida) && /psi/i.test(p.medida || '') ? ' psi' : ''));
  if (p.fugas && grupoDe(p, it) === 'reemplazo') { const f = detalleFugas(p, it); if (f) partes.push(f); }
  if (it.nota) partes.push(it.nota);
  return partes.join(' · ');
}

function datosVehiculoRev(rev) {
  const v = rev.vehiculoId && vehiculo(rev.vehiculoId);
  const c = v ? cliente(v.clienteId) : null;
  return {
    nombre: c?.nombre || '', telefono: c?.telefono || '',
    modelo: v ? `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}` : '', placa: v?.placa || '',
  };
}

// Crea (o reutiliza) cliente y vehículo a partir de los datos escritos en la revisión
function obtenerVehiculoNuevo(d) {
  const placa = d.placa.toUpperCase().replace(/\s+/g, '');
  const existente = db.vehiculos.find((v) => v.placa === placa);
  if (existente) {
    const c = cliente(existente.clienteId);
    if (!confirm(`La placa ${placa} ya está registrada (${existente.marca} ${existente.modelo} de ${c?.nombre || 'cliente'}).\n¿Usar ese vehículo?`)) return null;
    return existente.id;
  }
  const ahora = new Date().toISOString();
  let c = db.clientes.find((x) => telWhatsApp(x.telefono) === telWhatsApp(d.telefono));
  if (c && !confirm(`Ya existe un cliente con ese teléfono: ${c.nombre}.\n¿Asignarle este vehículo?`)) c = null;
  if (!c) { c = { id: uid(), nombre: d.nombre, telefono: d.telefono, creado: ahora }; db.clientes.push(c); }
  const v = { id: uid(), clienteId: c.id, marca: d.marca, modelo: d.modelo, placa, anio: d.anio, color: d.color, creado: ahora };
  db.vehiculos.push(v);
  return v.id;
}

// ===================== EDITOR =====================
let rvEdit = null;
let rvNuevo = true;
let rvDirty = false;

function revisionVacia(vid = null) {
  return {
    id: uid(), numero: 0, fecha: hoyISO(), tipo: 'basica', vehiculoId: vid, tecnico: '', km: null,
    items: {}, opciones: { traseras: {}, fluidos: [] }, observaciones: '',
    estructura: copiar(configRevision()), // puntos vigentes al crearla
    estado: 'abierta',
  };
}

function confirmarSalidaRev() {
  return !rvDirty || confirm('La revisión tiene cambios sin guardar. ¿Salir sin guardar?');
}

function irSubtabRev(cual) {
  $$('.subtab[data-rvtab]').forEach((b) => b.classList.toggle('active', b.dataset.rvtab === cual));
  $('#rv-nueva').hidden = cual !== 'nueva';
  $('#rv-historial').hidden = cual !== 'historial';
  $('#rv-ingreso').hidden = cual !== 'ingreso';
  if (cual === 'historial') renderHistorialRev();
  if (cual === 'ingreso' && typeof mostrarIngresos === 'function') mostrarIngresos();
}

function nuevaRevision(vid = null) {
  if (!confirmarSalidaRev()) return;
  rvEdit = revisionVacia(vid); rvNuevo = true; rvDirty = false;
  irSubtabRev('nueva');
  pintarEditorRev();
  window.scrollTo(0, 0);
}

function abrirRevision(id) {
  const r = db.revisiones.find((x) => x.id === id); if (!r) return;
  if (!confirmarSalidaRev()) return;
  rvEdit = JSON.parse(JSON.stringify(r));
  rvEdit.opciones = { traseras: {}, fluidos: [], ...(rvEdit.opciones || {}) };
  rvEdit.items = rvEdit.items || {};
  rvNuevo = false; rvDirty = false;
  irSubtabRev('nueva');
  pintarEditorRev();
  window.scrollTo(0, 0);
}

function clienteHTML() {
  if (rvEdit.vehiculoId && vehiculo(rvEdit.vehiculoId)) {
    const d = datosVehiculoRev(rvEdit);
    return `<div class="seleccion rv-sel-cliente">
      <div><strong>${esc(d.nombre)}</strong> · ${esc(d.telefono)}<br>${esc(d.modelo)} · <strong>${esc(d.placa)}</strong></div>
      <div class="rv-sel-botones">
        <button type="button" class="btn small ghost" data-rv="otro-vehiculo">+ Otro vehículo de este cliente</button>
        <button type="button" class="btn small ghost" data-rv="cambiar-cliente">Cambiar</button>
      </div>
    </div>`;
  }
  // Nuevo vehículo para un cliente ya registrado
  if (rvEdit._otroDe && cliente(rvEdit._otroDe)) {
    const c = cliente(rvEdit._otroDe);
    return `<div class="seleccion rv-sel-cliente">
      <div><strong>${esc(c.nombre)}</strong> · ${esc(c.telefono)}<br><span class="hint">Nuevo vehículo para este cliente:</span></div>
      <button type="button" class="btn small ghost" data-rv="cambiar-cliente">Cancelar</button>
    </div>
    <div id="rv-otro-vehiculo" style="margin-top:8px">${camposVehiculoHTML(rvEdit._vehNuevo || {})}</div>`;
  }
  const n = rvEdit._nuevo || {};
  return `
    <input id="rv-buscar-cliente" type="search" placeholder="Buscar cliente registrado por nombre, teléfono o placa…" autocomplete="off">
    <div id="rv-res-cliente" class="picker-list"></div>
    <p class="hint rv-o">o registra un cliente nuevo (quedará guardado en Registros):</p>
    <div class="grid" id="rv-nuevo-cliente">
      <label>Nombre *<input data-nuevo="nombre" value="${esc(n.nombre || '')}"></label>
      <label>Teléfono *<input data-nuevo="telefono" value="${esc(n.telefono || '')}" placeholder="0414-1234567" inputmode="tel"></label>
      <label>Marca *<input data-nuevo="marca" value="${esc(n.marca || '')}" list="lista-marcas"></label>
      <label>Modelo *<input data-nuevo="modelo" value="${esc(n.modelo || '')}"></label>
      <label>Placa *<input data-nuevo="placa" class="upper" value="${esc(n.placa || '')}"></label>
      <label>Año <span class="opt">(opcional)</span><input data-nuevo="anio" value="${esc(n.anio || '')}" inputmode="numeric" maxlength="4"></label>
      <label>Color <span class="opt">(opcional)</span><input data-nuevo="color" value="${esc(n.color || '')}"></label>
    </div>`;
}

// Estados de una revisión: abierta (se puede modificar), cerrada o cancelada (bloqueada).
// Solo un administrador puede reabrir una revisión cerrada o cancelada.
const ESTADOS_RVS = { abierta: 'Abierta', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const rvBloqueada = (r) => r && (r.estado === 'cerrada' || r.estado === 'cancelada');
const esAdminUI = () => !document.body.classList.contains('rol-taller');

function barraEstadoRev(r) {
  if (rvNuevo) return '';
  if (rvBloqueada(r)) {
    return `<div class="card rv-bloqueo">🔒 Esta revisión está <strong>${ESTADOS_RVS[r.estado].toLowerCase()}</strong>${r.fechaCierre ? ` desde el ${fmtFecha(r.fechaCierre)}` : ''}: no se puede modificar.
      ${esAdminUI() ? '<button type="button" class="btn small ghost" data-rv="reabrir-rev">Reabrir revisión</button>' : ''}</div>`;
  }
  return '';
}

function pintarEditorRev() {
  const r = rvEdit;
  const tecnicoOtro = r.tecnico && !tecnicos().includes(r.tecnico);
  const bloq = rvBloqueada(r);
  $('#rv-nueva').classList.toggle('rv-bloqueada', !!bloq);
  $('#rv-nueva').innerHTML = `
    ${barraEstadoRev(r)}
    <div class="card rv-cabecera">
      <div class="form-head">
        <h2>${rvNuevo ? 'Nueva revisión' : `Revisión ${numRev(r.numero)}`}</h2>
        <div class="rv-acciones-top">
          ${rvNuevo ? '' : `
            <button type="button" class="btn small wa" data-rv="wa">Enviar diagnóstico</button>
            <button type="button" class="btn small ghost" data-rv="pdf">⬇ PDF</button>
            <button type="button" class="btn small ghost" data-rv="presupuesto">Crear presupuesto</button>`}
          <button type="button" class="btn small ghost" data-rv="nueva">+ Nueva</button>
        </div>
      </div>
      <fieldset>
        <legend>Cliente y vehículo</legend>
        <div id="rv-cliente">${clienteHTML()}</div>
      </fieldset>
      <fieldset>
        <legend>Datos de la revisión</legend>
        <div class="rv-tipos">
          ${['basica', 'completa'].map((k) => [k, nombreTipo(r, k)]).map(([k, n]) => `<button type="button" class="rv-tipo ${r.tipo === k ? 'activo' : ''}" data-tipo="${k}">${n}</button>`).join('')}
        </div>
        <div class="grid" style="margin-top:12px">
          <label>Técnico asignado *
            <select id="rv-tecnico">
              <option value="">Selecciona…</option>
              ${tecnicos().map((t) => `<option ${t === r.tecnico ? 'selected' : ''}>${esc(t)}</option>`).join('')}
              <option value="__otro" ${tecnicoOtro ? 'selected' : ''}>Otro…</option>
            </select>
          </label>
          <label id="rv-tecnico-otro-wrap" ${tecnicoOtro ? '' : 'hidden'}>Nombre del técnico<input id="rv-tecnico-otro" value="${tecnicoOtro ? esc(r.tecnico) : ''}"></label>
          <label>Fecha<input id="rv-fecha" type="date" value="${r.fecha}"></label>
          <label>KM del vehículo <span class="opt">(opcional)</span><input id="rv-km" class="km" inputmode="numeric" value="${Number.isFinite(r.km) ? fmtNum(r.km) : ''}"></label>
        </div>
      </fieldset>
    </div>

    <div class="rv-layout">
      <div id="rv-checklist"></div>
      <aside class="card rv-resumen" id="rv-resumen"></aside>
    </div>

    <div class="card">
      <label>Observaciones generales <span class="opt">(opcional)</span>
        <textarea id="rv-obs" rows="3" placeholder="Comentarios adicionales para el cliente…">${esc(r.observaciones)}</textarea>
      </label>
    </div>

    <div class="rv-barra">
      <span id="rv-progreso"></span>
      ${bloq ? '<button type="button" class="btn ghost" data-rv="volver-hist">← Historial</button>' : `
        ${rvNuevo ? '' : '<button type="button" class="btn danger solo-admin" data-rv="borrar">Eliminar</button>'}
        ${rvNuevo ? '' : '<button type="button" class="btn ghost" data-rv="cancelar-rev">Cancelar revisión</button>'}
        ${rvNuevo ? '' : '<button type="button" class="btn ghost" data-rv="cerrar-rev">Cerrar revisión</button>'}
        <button type="button" class="btn primary" data-rv="guardar">Guardar revisión</button>`}
    </div>`;
  pintarChecklist();
  // Revisión cerrada: todos los campos quedan deshabilitados
  if (bloq) $$('#rv-nueva input, #rv-nueva select, #rv-nueva textarea').forEach((el) => (el.disabled = true));
}

// Cerrar / cancelar / reabrir una revisión
async function cambiarEstadoRev(estado) {
  const r = rvEdit;
  if (estado !== 'abierta') {
    if (rvDirty && !(await guardarRevision())) return;
    const txt = estado === 'cerrada'
      ? `¿Cerrar la revisión ${numRev(r.numero)}? Después no se podrá modificar${esAdminUI() ? ' (un administrador puede reabrirla)' : ''}.`
      : `¿Cancelar la revisión ${numRev(r.numero)}? Después no se podrá modificar${esAdminUI() ? ' (un administrador puede reabrirla)' : ''}.`;
    if (!confirm(txt)) return;
  } else if (!confirm(`¿Reabrir la revisión ${numRev(r.numero)} para modificarla?`)) return;
  const g = db.revisiones.find((x) => x.id === r.id); if (!g) return;
  g.estado = estado;
  g.fechaCierre = estado === 'abierta' ? null : hoyISO();
  g.actualizado = new Date().toISOString();
  rvEdit = JSON.parse(JSON.stringify(g)); rvDirty = false;
  await guardar();
  pintarEditorRev();
  toast(`Revisión ${numRev(r.numero)} ${ESTADOS_RVS[estado].toLowerCase()}`);
}

function botonesHTML(def, it) {
  // Fugas: solo Sí / No
  if (def.fugas) {
    return `<div class="rv-botones rv-dos">
      <button type="button" class="rv-b rv-urgente ${it.e === 'si' ? 'activo' : ''}" data-e="si">Sí, hay fugas</button>
      <button type="button" class="rv-b rv-bueno ${it.e === 'no' ? 'activo' : ''}" data-e="no">No hay fugas</button>
    </div>`;
  }
  // Fluidos (revisión completa): Nivel Óptimo/Falta y Estado Óptimo/Reemplazar
  if (def.fluido) {
    const par = (campo, titulo, opciones) => `<div class="rv-par"><span>${titulo}</span>${Object.entries(opciones).map(([v, n]) => `
      <button type="button" class="rv-b ${v === 'optimo' ? 'rv-bueno' : v === 'falta' ? 'rv-regular' : 'rv-urgente'} ${it[campo] === v ? 'activo' : ''}" data-sel="${campo}" data-v="${v}">${n}</button>`).join('')}</div>`;
    return par('nivel', 'Nivel', NIVEL_FLUIDO) + par('estadoF', 'Estado', ESTADO_FLUIDO);
  }
  return `<div class="rv-botones">${ORDEN_ESTADOS.map((e) => `
    <button type="button" class="rv-b ${ESTADOS_RV[e].cls} ${it.e === e ? 'activo' : ''}" data-e="${e}">${e === 'na' && def.naTexto ? def.naTexto : ESTADOS_RV[e].n}${def.vida && VIDA_FRENOS[e] ? `<span class="rv-vida">${VIDA_FRENOS[e]}</span>` : ''}</button>`).join('')}
  </div>`;
}

function itemHTML(def) {
  const it = rvEdit.items[def.k] || {};
  const grupo = grupoDe(def, it);
  const evaluado = grupo && grupo !== 'na';
  let detalle = '';
  if (evaluado) {
    let fugas = '';
    if (def.fugas && it.e === 'si') {
      const f = it.fugas || {};
      fugas = `<div class="rv-sub">¿Qué fluido tiene fuga? <span class="opt">(puedes marcar varios)</span></div>
        <div class="rv-chips">${(def.fluidos || []).map(([k, n]) => `<button type="button" class="rv-chip ${k in f ? 'activo' : ''}" data-fuga="${k}">${esc(n)}</button>`).join('')}</div>
        ${(def.fluidos || []).filter(([k]) => k in f).map(([k, n]) => `<label class="rv-lugar">${esc(n)}: <input data-fuga-lugar="${k}" value="${esc(f[k] || '')}" placeholder="¿Por dónde? (ej: retén trasero, cárter…)"></label>`).join('')}`;
    }
    detalle = `<div class="rv-detalle">
      ${def.medida ? `<input data-campo="medida" value="${esc(it.medida || '')}" placeholder="${esc(def.medida)}">` : ''}
      ${fugas}
      <input data-campo="nota" value="${esc(it.nota || '')}" placeholder="Observación (opcional)">
    </div>`;
  }
  return `<div class="rv-item ${grupo ? 'hecho ' + ESTADOS_RV[grupo].cls : ''}" data-k="${def.k}" id="rv-item-${def.k}">
    <div class="rv-cab">
      <span class="rv-nombre">${esc(def.n)}</span>
      ${def.traseras ? `<label class="rv-check"><input type="checkbox" data-traseras="${def.k}" ${rvEdit.opciones.traseras[def.k] ? 'checked' : ''}> ¿Aplica traseras?</label>` : ''}
    </div>
    ${botonesHTML(def, it)}
    ${detalle}
  </div>`;
}

function pintarChecklist() {
  const r = rvEdit;
  $('#rv-checklist').innerHTML = seccionesDe(r).map((sec) => `
    <div class="card rv-seccion">
      <h3>${esc(sec.t)}</h3>
      ${sec.items.map((def) => {
        if (def.selector) {
          const sel = r.opciones.fluidos || [];
          return `<div class="rv-item rv-selector">
            <div class="rv-cab"><span class="rv-nombre">${esc(def.n)}</span><small class="hint">Selecciona cuáles revisar:</small></div>
            <div class="rv-chips">${def.selector.map((s) => `<button type="button" class="rv-chip ${sel.includes(s.k) ? 'activo' : ''}" data-fluido="${s.k}">${esc(s.n.replace('Fluido de ', ''))}</button>`).join('')}</div>
          </div>${def.selector.filter((s) => sel.includes(s.k)).map(itemHTML).join('')}`;
        }
        return itemHTML(def) + (def.traseras && r.opciones.traseras[def.k] ? itemHTML(def.traseras) : '');
      }).join('')}
    </div>`).join('');
  pintarResumen();
}

function pintarResumen() {
  const r = rvEdit; const c = conteo(r);
  const pts = puntosActivos(r);
  const grupo = (e) => {
    const lista = pts.filter((p) => estadoDe(r, p.k) === e);
    if (!lista.length) return '';
    return `<div class="rv-res-grupo ${ESTADOS_RV[e].cls}">
      <div class="rv-res-tit">${ESTADOS_RV[e].n} <span>${lista.length}</span></div>
      ${lista.map((p) => `<a href="#" data-ir="${p.k}">${esc(p.n)}</a>`).join('')}
    </div>`;
  };
  const pct = c.total ? Math.round(((c.total - c.pendientes) / c.total) * 100) : 0;
  $('#rv-resumen').innerHTML = `
    <h3>Resumen</h3>
    <div class="rv-prog"><div style="width:${pct}%"></div></div>
    <p class="hint">${c.total - c.pendientes} de ${c.total} puntos evaluados</p>
    ${grupo('reemplazo')}${grupo('regular')}${grupo('bueno')}
    ${c.na ? `<p class="hint">${c.na} punto(s) marcados N/A (no se incluyen en el diagnóstico).</p>` : ''}
    ${c.total - c.pendientes === 0 ? '<p class="hint">Toca los botones de cada punto para ir armando el diagnóstico.</p>' : ''}`;
  const prog = $('#rv-progreso');
  if (prog) prog.textContent = `${c.total - c.pendientes}/${c.total} evaluados · ${c.reemplazo} reemplazo · ${c.regular} regular · ${c.bueno} bueno`;
}

function leerCabeceraRev() {
  const r = rvEdit; if (!$('#rv-tecnico')) return;
  const t = $('#rv-tecnico').value;
  r.tecnico = t === '__otro' ? $('#rv-tecnico-otro').value.trim() : t;
  r.fecha = $('#rv-fecha').value || hoyISO();
  const km = parseKm($('#rv-km').value); r.km = Number.isFinite(km) ? km : null;
  r.observaciones = $('#rv-obs').value.trim();
  if (!r.vehiculoId && r._otroDe && $('#rv-otro-vehiculo')) r._vehNuevo = leerCamposVehiculo($('#rv-otro-vehiculo'));
  else if (!r.vehiculoId) {
    r._nuevo = {};
    $$('#rv-nuevo-cliente [data-nuevo]').forEach((i) => (r._nuevo[i.dataset.nuevo] = i.value.trim()));
  }
}

async function guardarRevision() {
  leerCabeceraRev();
  const r = rvEdit;
  if (!r.vehiculoId && r._otroDe) {
    const vid = crearVehiculoCliente(r._otroDe, r._vehNuevo || {});
    if (!vid) return false;
    r.vehiculoId = vid; delete r._otroDe; delete r._vehNuevo;
  }
  if (!r.vehiculoId) {
    const d = r._nuevo || {};
    const faltan = ['nombre', 'telefono', 'marca', 'modelo', 'placa'].filter((k) => !d[k]);
    if (faltan.length) { alert('Selecciona un cliente registrado o completa los datos del cliente nuevo (nombre, teléfono, marca, modelo y placa).'); return false; }
    if (soloDigitos(d.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos.'); return false; }
    const vid = obtenerVehiculoNuevo(d);
    if (!vid) return false;
    r.vehiculoId = vid;
  }
  if (!r.tecnico) { alert('Asigna un técnico a la revisión.'); $('#rv-tecnico').focus(); return false; }
  const c = conteo(r);
  if (c.total === c.pendientes) { alert('Evalúa al menos un punto antes de guardar.'); return false; }
  if (c.pendientes && !confirm(`Quedan ${c.pendientes} punto(s) sin evaluar. ¿Guardar de todas formas?`)) return false;

  // Limpiar datos de puntos que ya no están activos (p. ej. traseras desmarcadas)
  const activos = new Set(puntosActivos(r).map((p) => p.k));
  Object.keys(r.items).forEach((k) => { if (!activos.has(k)) delete r.items[k]; });
  delete r._nuevo;
  if (!r.estructura) r.estructura = copiar(configRevision());
  r.actualizado = new Date().toISOString();
  if (rvNuevo) {
    r.numero = siguienteNumeroRev(); r.creado = r.actualizado;
    db.revisiones.push(JSON.parse(JSON.stringify(r)));
  } else {
    const i = db.revisiones.findIndex((x) => x.id === r.id);
    db.revisiones[i] = JSON.parse(JSON.stringify(r));
  }
  rvNuevo = false; rvDirty = false;
  await guardar();
  pintarEditorRev();
  toast(`Revisión ${numRev(r.numero)} guardada`);
  return true;
}

// ===================== DIAGNÓSTICO: WHATSAPP =====================
function mensajeDiagnostico(rev) {
  const d = datosVehiculoRev(rev);
  const pts = puntosActivos(rev);
  const lineas = [
    `Hola${d.nombre ? ' ' + d.nombre : ''}, te compartimos el diagnóstico de la ${rev.tipo === 'completa' ? 'revisión completa' : 'revisión básica'} de tu ${d.modelo} (${d.placa}) realizada el ${fmtFecha(rev.fecha)}.`,
  ];
  const linea = (p) => {
    const it = rev.items[p.k];
    const nota = it.nota ? (p.fluido ? ' · ' : ': ') + it.nota : '';
    if (p.fluido) return `- ${p.n}: ${textoFluido(it)}${nota}`;
    if (p.vida) return `- ${p.n} (vida útil ${VIDA_FRENOS[estadoDe(rev, p.k)]})${nota}`;
    const det = detallePunto(p, it);
    return `- ${p.n}${det ? ': ' + det : ''}`;
  };
  ['reemplazo', 'regular'].forEach((e) => {
    const lista = pts.filter((p) => estadoDe(rev, p.k) === e && !p.fugas);
    if (lista.length) { lineas.push('', `*${ESTADOS_RV[e].titulo}*`); lista.forEach((p) => lineas.push(linea(p))); }
    // Las fugas van en su propia sección, justo después de los reemplazos
    if (e === 'reemplazo') {
      const fuga = pts.find((p) => p.fugas && estadoDe(rev, p.k) === 'reemplazo');
      if (fuga) {
        const it = rev.items[fuga.k]; const f = it.fugas || {};
        lineas.push('', '*FUGAS DETECTADAS*');
        const fl = (fuga.fluidos || []).filter(([k]) => k in f);
        if (fl.length) fl.forEach(([k, n]) => lineas.push(`- ${n}${f[k] ? ': ' + f[k] : ''}`)); else lineas.push('- Fuga de fluidos');
        if (it.nota) lineas.push(`  ${it.nota}`);
      }
    }
  });
  const buenos = pts.filter((p) => estadoDe(rev, p.k) === 'bueno');
  if (buenos.length) {
    lineas.push('', `*${ESTADOS_RV.bueno.titulo}*`, buenos.map((p) => {
      const it = rev.items[p.k];
      if (p.fugas) return 'Sin fugas de fluidos';
      if (p.fluido) return `${p.n} (nivel y estado óptimos)`;
      if (p.vida) return `${p.n} (vida útil ${VIDA_FRENOS.bueno})`;
      return p.n + (it.medida ? ` (${detallePunto(p, it)})` : '');
    }).join(', ') + '.');
  }
  if (rev.observaciones) lineas.push('', `*Observaciones:* ${rev.observaciones}`);
  lineas.push('', `Técnico: ${rev.tecnico}`);
  if (pts.some((p) => ['reemplazo', 'regular'].includes(estadoDe(rev, p.k)))) lineas.push('Si deseas el presupuesto de los trabajos recomendados, respóndenos este mensaje.');
  lineas.push(`— ${CONFIG.taller}`);
  return lineas.join('\n');
}

async function enviarDiagnostico(rev) {
  const d = datosVehiculoRev(rev);
  let tel = d.telefono;
  if (soloDigitos(tel).length < 10) {
    tel = (prompt('Número de WhatsApp del cliente (ej: 0414-1234567):', tel || '') || '').trim();
    if (soloDigitos(tel).length < 10) return;
  }
  const texto = mensajeDiagnostico(rev);
  abrirWhatsApp(tel, texto);
  db.mensajes.push({ id: uid(), vehiculoId: rev.vehiculoId, telefono: tel, tipo: 'revision', texto: `Diagnóstico revisión ${numRev(rev.numero)}`, fecha: hoyISO(), creado: new Date().toISOString() });
  const g = db.revisiones.find((x) => x.id === rev.id); if (g) g.diagnosticoEnviado = hoyISO();
  await guardar(false);
  toast('Diagnóstico abierto en WhatsApp. Puedes adjuntar también el PDF.');
}

// ===================== DIAGNÓSTICO: PDF =====================
function docRevHTML(rev) {
  const d = datosVehiculoRev(rev);
  const c = conteo(rev);
  const filas = seccionesDe(rev).map((sec) => {
    const pts = puntosActivos(rev).filter((p) => p.seccion === sec.t && ['reemplazo', 'regular', 'bueno'].includes(estadoDe(rev, p.k)));
    if (!pts.length) return '';
    return `<tr class="rv-pdf-sec"><td colspan="3">${esc(sec.t)}</td></tr>` + pts.map((p) => {
      const it = rev.items[p.k];
      const g = estadoDe(rev, p.k);
      return `<tr><td>${esc(p.n)}</td><td><span class="rv-pdf-estado ${ESTADOS_RV[g].cls}">${esc(etiquetaEstado(p, it))}</span></td><td>${esc(detallePunto(p, it))}</td></tr>`;
    }).join('');
  }).join('');
  return `<div class="doc doc-print doc-rev">
    <div class="doc-head">
      <img class="doc-logo" src="img/logo.png" alt="Jacks">
      <div class="doc-empresa">
        <div class="doc-nombre">${EMPRESA.nombre}</div>
        <div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div>
      </div>
    </div>
    <div class="doc-numero">${rev.tipo === 'completa' ? 'REVISIÓN COMPLETA' : 'REVISIÓN BÁSICA'} ${numRev(rev.numero)}</div>
    <div class="doc-box">
      <div class="doc-fila2"><div>CLIENTE: ${esc(d.nombre)}</div><div class="r">FECHA: ${fmtFecha(rev.fecha)}</div></div>
      <div class="doc-fila2"><div>TELÉFONO: ${esc(d.telefono)}</div><div class="r">VEHÍCULO: ${esc(d.modelo)} · ${esc(d.placa)}</div></div>
      <div class="doc-fila2"><div>TÉCNICO: ${esc(rev.tecnico)}</div><div class="r">${Number.isFinite(rev.km) ? 'KM: ' + fmtNum(rev.km) : ''}</div></div>
    </div>
    <div class="rv-pdf-conteo">
      <span class="rv-urgente">Reemplazo inmediato: <strong>${c.reemplazo}</strong></span>
      <span class="rv-regular">Estado regular: <strong>${c.regular}</strong></span>
      <span class="rv-bueno">Buen estado: <strong>${c.bueno}</strong></span>
    </div>
    <table class="doc-items rv-pdf-tabla">
      <thead><tr><th>PUNTO REVISADO</th><th>ESTADO</th><th>OBSERVACIONES</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${rev.observaciones ? `<div class="doc-obs" style="border-top:1px solid #111;margin-top:8px">
      <div class="lbl">Observaciones generales</div>
      <div class="obs-texto">${esc(rev.observaciones).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
  </div>`;
}

function pdfRevision(rev) {
  const d = datosVehiculoRev(rev);
  imprimirDocumento(docRevHTML(rev), `Revision ${numRev(rev.numero).slice(1)}${d.nombre ? ' - ' + d.nombre : ''}`);
}

// ===================== PRESUPUESTO DESDE REVISIÓN =====================
function presupuestoDesdeRevision(rev) {
  const pts = puntosActivos(rev);
  const urgentes = pts.filter((p) => estadoDe(rev, p.k) === 'reemplazo');
  const regulares = pts.filter((p) => estadoDe(rev, p.k) === 'regular');
  let elegidos = urgentes;
  if (regulares.length && confirm(`¿Incluir también los ${regulares.length} punto(s) en estado regular?\n(Aceptar = sí, Cancelar = solo los de reemplazo inmediato)`)) elegidos = [...urgentes, ...regulares];
  const items = elegidos.map((p) => {
    const it = rev.items[p.k];
    let desc = p.n;
    if (p.fugas) { const f = detalleFugas(p, it); desc = 'Reparación de fuga' + (f ? ': ' + f : ''); }
    if (p.fluido) desc = (it.estadoF === 'reemplazar' ? 'Cambio de ' : 'Completar nivel de ') + p.n.charAt(0).toLowerCase() + p.n.slice(1);
    if (it.nota) desc += ' - ' + it.nota;
    return { cant: 1, unidad: 'Und.', desc, sku: '', precio: NaN };
  });
  irA('presupuestos');
  nuevoPresupuesto(rev.vehiculoId, { items, revisionId: rev.id });
  toast(items.length ? `Presupuesto creado con ${items.length} línea(s) de la revisión ${numRev(rev.numero)}. Completa los precios.` : 'Presupuesto creado (la revisión no tenía puntos para reemplazo).');
}

// ===================== HISTORIAL =====================
function resultadoHTML(rev) {
  const c = conteo(rev);
  return `<span class="rv-mini rv-urgente" title="Reemplazo inmediato">${c.reemplazo}</span><span class="rv-mini rv-regular" title="Estado regular">${c.regular}</span><span class="rv-mini rv-bueno" title="Buen estado">${c.bueno}</span>`;
}

function renderHistorialRev() {
  if (!db.revisiones) db.revisiones = [];
  $('#rv-contador').textContent = db.revisiones.length || '';
  if (!$('#rv-tabla')) return;
  const q = norm($('#rv-buscar').value).trim();
  const tipo = $('#rv-filtro-tipo').value;
  const lista = db.revisiones
    .filter((r) => !tipo || r.tipo === tipo)
    .filter((r) => { if (!q) return true; const d = datosVehiculoRev(r); return norm([numRev(r.numero), r.numero, d.nombre, d.telefono, d.modelo, d.placa, r.tecnico].join(' ')).includes(q); })
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('#rv-tabla').innerHTML = lista.map((r) => {
    const d = datosVehiculoRev(r);
    return `<tr data-rid="${r.id}">
      <td><strong>${numRev(r.numero)}</strong></td>
      <td>${fmtFecha(r.fecha)}</td>
      <td>${esc(d.nombre || '—')}</td>
      <td>${esc(d.modelo)} · ${esc(d.placa)}</td>
      <td>${r.tipo === 'completa' ? 'Completa' : 'Básica'}</td>
      <td>${esc(r.tecnico)}</td>
      <td class="rv-resultado">${resultadoHTML(r)}</td>
      <td><span class="estado-rvs ${r.estado || 'abierta'}">${ESTADOS_RVS[r.estado] || 'Abierta'}</span></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-rvh="editar" title="${rvBloqueada(r) ? 'Ver' : 'Modificar'}">${rvBloqueada(r) ? '👁' : '✏️'}</button>
        <button class="btn tiny ghost" data-rvh="pdf">PDF</button>
        <button class="btn tiny wa" data-rvh="wa">WhatsApp</button>
        <button class="btn tiny ghost" data-rvh="presupuesto">Presupuesto</button>
      </td>
    </tr>`;
  }).join('');
  const v = $('#rv-vacio');
  v.hidden = lista.length > 0;
  v.textContent = db.revisiones.length ? 'Ninguna revisión coincide con la búsqueda.' : 'Aún no hay revisiones guardadas.';
}

function renderRevisiones() { renderHistorialRev(); }

// Al entrar a la pestaña: si no hay cambios sin guardar, formulario limpio.
// Una revisión guardada solo se vuelve a abrir desde el historial.
function reiniciarVistaRevisiones() {
  if (rvDirty) return;
  if (!rvNuevo || (rvEdit && Object.keys(rvEdit.items).length)) { rvEdit = revisionVacia(); rvNuevo = true; pintarEditorRev(); }
}

// ===================== EVENTOS =====================
function initRevisiones() {
  if (!db.revisiones) db.revisiones = [];
  $$('.subtab[data-rvtab]').forEach((b) => (b.onclick = () => {
    if (b.dataset.rvtab === 'historial' && rvDirty && !confirmarSalidaRev()) return;
    if (b.dataset.rvtab === 'historial') rvDirty = false;
    irSubtabRev(b.dataset.rvtab);
  }));
  $('#rv-buscar').oninput = renderHistorialRev;
  $('#rv-filtro-tipo').onchange = renderHistorialRev;
  $('#rv-tabla').onclick = (e) => {
    const tr = e.target.closest('[data-rid]'); if (!tr) return;
    const rev = db.revisiones.find((x) => x.id === tr.dataset.rid); if (!rev) return;
    const b = e.target.closest('[data-rvh]');
    if (b?.dataset.rvh === 'pdf') return pdfRevision(rev);
    if (b?.dataset.rvh === 'wa') return enviarDiagnostico(rev);
    if (b?.dataset.rvh === 'presupuesto') return presupuestoDesdeRevision(rev);
    abrirRevision(rev.id);
  };

  const cont = $('#rv-nueva');
  cont.addEventListener('click', async (e) => {
    const r = rvEdit; if (!r) return;
    const t = e.target;
    // Revisión cerrada/cancelada: solo se permiten acciones de la barra (PDF, WhatsApp, reabrir…)
    if (rvBloqueada(r) && !t.closest('[data-rv]')) return;
    // Nivel / estado de un fluido (revisión completa)
    const btnSel = t.closest('[data-sel]');
    if (btnSel) {
      const k = btnSel.closest('[data-k]').dataset.k;
      const it = r.items[k] || (r.items[k] = {});
      const campo = btnSel.dataset.sel;
      it[campo] = it[campo] === btnSel.dataset.v ? '' : btnSel.dataset.v;
      if (!it.nivel && !it.estadoF) delete r.items[k];
      rvDirty = true; pintarChecklist(); return;
    }
    // Estado de un punto (un toque)
    const btnE = t.closest('.rv-b[data-e]');
    if (btnE) {
      const k = btnE.closest('[data-k]').dataset.k;
      const it = r.items[k] || (r.items[k] = {});
      it.e = it.e === btnE.dataset.e ? '' : btnE.dataset.e; // tocar de nuevo lo desmarca
      if (!it.e) delete r.items[k];
      rvDirty = true; pintarChecklist(); return;
    }
    const chipFuga = t.closest('[data-fuga]');
    if (chipFuga) {
      const k = chipFuga.closest('[data-k]').dataset.k; const it = r.items[k];
      it.fugas = it.fugas || {};
      if (chipFuga.dataset.fuga in it.fugas) delete it.fugas[chipFuga.dataset.fuga]; else it.fugas[chipFuga.dataset.fuga] = '';
      rvDirty = true; pintarChecklist(); return;
    }
    const chipFluido = t.closest('[data-fluido]');
    if (chipFluido) {
      const f = chipFluido.dataset.fluido; const sel = r.opciones.fluidos;
      const i = sel.indexOf(f); if (i >= 0) sel.splice(i, 1); else sel.push(f);
      rvDirty = true; pintarChecklist(); return;
    }
    const tipo = t.closest('[data-tipo]');
    if (tipo) {
      leerCabeceraRev(); r.tipo = tipo.dataset.tipo; rvDirty = true;
      $$('.rv-tipo').forEach((b) => b.classList.toggle('activo', b.dataset.tipo === r.tipo));
      pintarChecklist(); return;
    }
    const ir = t.closest('[data-ir]');
    if (ir) { e.preventDefault(); const el = $('#rv-item-' + ir.dataset.ir); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('rv-resaltar'); setTimeout(() => el.classList.remove('rv-resaltar'), 1200); } return; }
    const pick = t.closest('[data-pick]');
    if (pick) { leerCabeceraRev(); r.vehiculoId = pick.dataset.pick; rvDirty = true; $('#rv-cliente').innerHTML = clienteHTML(); return; }

    const b = t.closest('[data-rv]'); if (!b) return;
    switch (b.dataset.rv) {
      case 'cambiar-cliente': leerCabeceraRev(); r.vehiculoId = null; delete r._otroDe; delete r._vehNuevo; rvDirty = true; $('#rv-cliente').innerHTML = clienteHTML(); break;
      case 'otro-vehiculo': {
        leerCabeceraRev();
        r._otroDe = vehiculo(r.vehiculoId)?.clienteId; r._vehNuevo = {}; r.vehiculoId = null; rvDirty = true;
        $('#rv-cliente').innerHTML = clienteHTML();
        $('#rv-otro-vehiculo [data-veh="marca"]')?.focus();
        break;
      }
      case 'cerrar-rev': await cambiarEstadoRev('cerrada'); break;
      case 'cancelar-rev': await cambiarEstadoRev('cancelada'); break;
      case 'reabrir-rev': await cambiarEstadoRev('abierta'); break;
      case 'volver-hist': rvDirty = false; nuevaRevision(); irSubtabRev('historial'); break;
      case 'guardar':
        // Al guardar: limpiar el formulario y mostrar el historial
        if (await guardarRevision()) { nuevaRevision(); irSubtabRev('historial'); }
        break;
      case 'nueva': nuevaRevision(); break;
      case 'wa': if (rvDirty && !(await guardarRevision())) break; enviarDiagnostico(rvEdit); break;
      case 'pdf': if (rvDirty && !(await guardarRevision())) break; pdfRevision(rvEdit); break;
      case 'presupuesto': if (rvDirty && !(await guardarRevision())) break; presupuestoDesdeRevision(rvEdit); break;
      case 'borrar':
        if (confirm(`¿Eliminar la revisión ${numRev(r.numero)}? Esto no se puede deshacer.`)) {
          db.revisiones = db.revisiones.filter((x) => x.id !== r.id);
          rvDirty = false; await guardar(); nuevaRevision(); irSubtabRev('historial'); toast('Revisión eliminada');
        }
        break;
    }
  });
  cont.addEventListener('input', (e) => {
    const r = rvEdit; if (!r) return;
    const t = e.target;
    if (t.id === 'rv-buscar-cliente') {
      const lista = buscarVehiculos(t.value).slice(0, 6);
      $('#rv-res-cliente').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong> <small>${esc(cliente(v.clienteId).telefono)}</small><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
      return;
    }
    rvDirty = true;
    const k = t.closest('[data-k]')?.dataset.k;
    if (k && t.dataset.campo) { r.items[k][t.dataset.campo] = t.value.trim(); pintarResumen(); return; }
    if (k && t.dataset.fugaLugar) { r.items[k].fugas[t.dataset.fugaLugar] = t.value.trim(); return; }
  });
  cont.addEventListener('change', (e) => {
    const r = rvEdit; if (!r) return;
    const t = e.target;
    if (t.dataset.traseras) { r.opciones.traseras[t.dataset.traseras] = t.checked; rvDirty = true; pintarChecklist(); return; }
    if (t.id === 'rv-tecnico') { $('#rv-tecnico-otro-wrap').hidden = t.value !== '__otro'; if (t.value === '__otro') $('#rv-tecnico-otro').focus(); }
    rvDirty = true;
  });

  window.addEventListener('beforeunload', (e) => { if (rvDirty) { e.preventDefault(); e.returnValue = ''; } });

  nuevaRevision();
  renderHistorialRev();
}

initRevisiones();

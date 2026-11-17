/* Jacks4WD – Configuración
 * Puntos de revisión (agregar, editar, ordenar, eliminar), técnicos y catálogo de aceites.
 * Los cambios se guardan en los datos (db.config) y aplican a las revisiones nuevas;
 * las revisiones guardadas conservan los puntos con los que se hicieron.
 */

let cfgEdit = null;   // copia de trabajo de los puntos de revisión
let cfgDirty = false;
let tecEdit = null;   // copia de trabajo de los técnicos
let tecDirty = false;

const claveNueva = (pref) => pref + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const GRUPOS_CFG = { basica: 'Revisión básica', completa: 'Adicional en la revisión completa' };

function irSubtabCfg(cual) {
  $$('.subtab[data-cfgtab]').forEach((b) => b.classList.toggle('active', b.dataset.cfgtab === cual));
  ['puntos', 'tecnicos', 'mensajes', 'plantillas', 'aceites'].forEach((c) => ($('#cfg-' + c).hidden = c !== cual));
  if (cual === 'mensajes') {
    if (!msgDirty) msgEdit = { motivos: [...motivosCita()], mensajes: Object.fromEntries(Object.keys(TITULOS_MENSAJES).map((k) => [k, textoMensaje(k)])) };
    pintarCfgMensajes();
  }
  if (cual === 'plantillas') { if (!plDirty) plEdit = copiar(plantillasPres()); pintarCfgPlantillas(); }
  if (cual === 'puntos') { if (!cfgDirty) cfgEdit = copiar(configRevision()); pintarCfgPuntos(); }
  if (cual === 'tecnicos') { if (!tecDirty) tecEdit = [...tecnicos()]; pintarCfgTecnicos(); }
  if (cual === 'aceites') renderCatalogo();
}

function abrirConfiguracion() {
  irA('config');
  irSubtabCfg($('.subtab.active[data-cfgtab]')?.dataset.cfgtab || 'puntos');
}

// ===================== PUNTOS DE REVISIÓN =====================
function extraItemHTML(it) {
  if (it.tipo === 'botones') {
    const juegos = cfgEdit.botones || [];
    if (!juegos.length) return '<small class="hint">Primero crea un juego en <strong>Botones personalizados</strong> (arriba).</small>';
    return `<label class="cfg-juego-sel"><small class="hint">Juego de botones:</small>
      <select data-campo="juego">${juegos.map((j) => `<option value="${j.id}" ${j.id === it.juego ? 'selected' : ''}>${esc(j.n || 'Sin nombre')} (${j.op.map((o) => esc(o.n)).join(' / ')})</option>`).join('')}</select></label>`;
  }
  if (it.tipo === 'traseras') return `<input data-campo="nTras" value="${esc(it.nTras || '')}" placeholder="Nombre del punto trasero (ej: Barras link traseras)">`;
  if (it.tipo === 'medida') return `<input data-campo="medida" value="${esc(it.medida || '')}" placeholder="Texto del campo de medida (ej: Valor medido (psi))">
    <input data-campo="naTexto" value="${esc(it.naTexto || '')}" placeholder="Texto del botón N/A (opcional, ej: No es posible medir)">`;
  if (it.tipo === 'fugas' || it.tipo === 'fluidos') {
    const titulo = it.tipo === 'fugas' ? 'Fluidos que se pueden marcar con fuga:' : 'Fluidos para revisar nivel y estado:';
    return `<div class="cfg-subs"><small class="hint">${titulo}</small>
      ${(it.sub || []).map((s, i) => `<span class="cfg-sub" data-sub="${i}"><input data-campo="subn" value="${esc(s.n)}"><button type="button" class="btn tiny ghost" data-cfg="borrar-sub" title="Quitar">✕</button></span>`).join('')}
      <button type="button" class="btn tiny ghost" data-cfg="agregar-sub">+ Agregar fluido</button></div>`;
  }
  return '';
}

function pintarCfgPuntos() {
  const bloque = (g) => `
    <h3 class="cfg-grupo">${GRUPOS_CFG[g]}</h3>
    ${(cfgEdit[g] || []).map((sec, s) => `
      <div class="card cfg-seccion" data-g="${g}" data-s="${s}">
        <div class="cfg-sec-cab">
          <input data-campo="t" value="${esc(sec.t)}" placeholder="Nombre de la sección">
          <button type="button" class="btn tiny ghost" data-cfg="subir-sec" title="Subir sección">↑</button>
          <button type="button" class="btn tiny ghost" data-cfg="bajar-sec" title="Bajar sección">↓</button>
          <button type="button" class="btn tiny danger" data-cfg="borrar-sec">Eliminar sección</button>
        </div>
        ${sec.items.map((it, i) => `
          <div class="cfg-item" data-i="${i}">
            <span class="cfg-num">${i + 1}</span>
            <div class="cfg-campos">
              <div class="cfg-fila">
                <input data-campo="n" value="${esc(it.n)}" placeholder="Nombre del punto">
                <select data-campo="tipo">${Object.entries(TIPOS_PUNTO).map(([k, n]) => `<option value="${k}" ${it.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
              </div>
              ${extraItemHTML(it)}
            </div>
            <div class="cfg-botones">
              <button type="button" class="btn tiny ghost" data-cfg="subir" title="Subir">↑</button>
              <button type="button" class="btn tiny ghost" data-cfg="bajar" title="Bajar">↓</button>
              <button type="button" class="btn tiny danger" data-cfg="borrar-item" title="Eliminar punto">✕</button>
            </div>
          </div>`).join('')}
        <button type="button" class="btn small ghost" data-cfg="agregar-item">+ Agregar punto</button>
      </div>`).join('')}
    <button type="button" class="btn small ghost cfg-add-sec" data-cfg="agregar-sec" data-g="${g}">+ Agregar sección</button>`;

  $('#cfg-puntos').innerHTML = `
    <div class="card cfg-barra">
      <div>
        <h2>Puntos de revisión</h2>
        <p class="hint" style="margin:0">Agrega, edita, ordena o elimina puntos. Los cambios aplican a las revisiones <strong>nuevas</strong>; las ya guardadas conservan sus puntos.</p>
      </div>
      <div class="cfg-acciones">
        <button type="button" class="btn small ghost" data-cfg="restaurar">Restaurar originales</button>
        <button type="button" class="btn primary" data-cfg="guardar">${cfgDirty ? 'Guardar cambios •' : 'Guardar cambios'}</button>
      </div>
    </div>
    ${juegosHTML()}
    ${bloque('basica')}
    ${bloque('completa')}`;
}

// Juegos de botones personalizados (ej: "Sí / No", "Bien / Desgastado / Roto")
const NIVELES_BOTON = { reemplazo: 'Rojo · Reemplazo inmediato', regular: 'Amarillo · Estado regular', bueno: 'Verde · Buen estado', na: 'Gris · No aplica' };
function juegosHTML() {
  const juegos = cfgEdit.botones || (cfgEdit.botones = []);
  return `<div class="card cfg-juegos">
    <h3 style="margin-top:0">Botones personalizados</h3>
    <p class="hint">Crea tus propios juegos de botones y úsalos en cualquier punto (tipo <strong>"Botones personalizados"</strong>). El <strong>color</strong> de cada botón indica en qué grupo del diagnóstico aparece: rojo = reemplazo inmediato, amarillo = regular, verde = buen estado, gris = no aplica.</p>
    ${juegos.map((j, x) => `<div class="cfg-juego" data-jb="${x}">
      <div class="cfg-sec-cab">
        <input data-jcampo="n" value="${esc(j.n)}" placeholder="Nombre del juego (ej: Sí / No)">
        <button type="button" class="btn tiny danger" data-cfg="borrar-juego">Eliminar juego</button>
      </div>
      ${j.op.map((o, y) => `<div class="cfg-op" data-op="${y}">
        <span class="rv-b ${ESTADOS_RV[o.g].cls} activo cfg-op-muestra">${esc(o.n || 'Botón')}</span>
        <input data-jcampo="opn" value="${esc(o.n)}" placeholder="Texto del botón" maxlength="40">
        <select data-jcampo="opg">${Object.entries(NIVELES_BOTON).map(([k, n]) => `<option value="${k}" ${o.g === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button type="button" class="btn tiny ghost" data-cfg="borrar-op" title="Quitar botón">✕</button>
      </div>`).join('')}
      ${j.op.length < 8 ? '<button type="button" class="btn tiny ghost" data-cfg="agregar-op">+ Agregar botón</button>' : ''}
    </div>`).join('')}
    <button type="button" class="btn small ghost" data-cfg="agregar-juego">+ Crear juego de botones</button>
  </div>`;
}

function marcarCfg() {
  cfgDirty = true;
  const b = $('#cfg-puntos [data-cfg="guardar"]'); if (b) b.textContent = 'Guardar cambios •';
}

async function guardarCfgPuntos() {
  // Validar: sin nombres vacíos
  for (const g of ['basica', 'completa']) {
    for (const sec of cfgEdit[g]) {
      sec.t = sec.t.trim() || 'Sección';
      for (const it of sec.items) {
        it.n = (it.n || '').trim();
        if (!it.n) { alert(`Hay un punto sin nombre en la sección "${sec.t}". Escríbele un nombre o elimínalo.`); return; }
        if (it.tipo === 'traseras') { it.kTras = it.kTras || it.k + '_tras'; it.nTras = (it.nTras || '').trim() || it.n + ' (traseras)'; }
        if (it.tipo === 'fugas' || it.tipo === 'fluidos') {
          it.sub = (it.sub || []).map((s) => ({ ...s, n: (s.n || '').trim() })).filter((s) => s.n);
          if (!it.sub.length) { alert(`"${it.n}" necesita al menos un fluido.`); return; }
        }
      }
    }
  }
  for (const j of cfgEdit.botones || []) {
    j.n = (j.n || '').trim();
    j.op = j.op.map((o) => ({ ...o, n: (o.n || '').trim() })).filter((o) => o.n);
    if (!j.n) j.n = j.op.map((o) => o.n).join(' / ');
    if (j.op.length < 2) { alert(`El juego de botones "${j.n || 'sin nombre'}" necesita al menos 2 botones con texto.`); return; }
  }
  for (const g of ['basica', 'completa']) for (const sec of cfgEdit[g]) for (const it of sec.items) {
    if (it.tipo === 'botones' && !(cfgEdit.botones || []).some((j) => j.id === it.juego)) { alert(`Elige un juego de botones para "${it.n}".`); return; }
  }
  if (!cfgEdit.basica.some((s) => s.items.length)) { alert('La revisión básica debe tener al menos un punto.'); return; }
  db.config.revision = limpiarEstructura(copiar(cfgEdit));
  cfgDirty = false;
  await guardar();
  cfgEdit = copiar(db.config.revision);
  pintarCfgPuntos();
  // Si hay una revisión nueva sin empezar, se actualiza con los puntos nuevos
  if (typeof rvNuevo !== 'undefined' && rvNuevo && !rvDirty) { rvEdit = revisionVacia(rvEdit?.vehiculoId || null); pintarEditorRev(); }
  toast('Puntos de revisión guardados');
}

// ===================== TÉCNICOS =====================
function pintarCfgTecnicos() {
  $('#cfg-tecnicos').innerHTML = `
    <div class="card">
      <div class="form-head">
        <div><h2>Técnicos</h2><p class="hint" style="margin:0">Aparecen en la lista "Técnico asignado" de cada revisión.</p></div>
        <button type="button" class="btn primary" data-tec="guardar">${tecDirty ? 'Guardar •' : 'Guardar'}</button>
      </div>
      ${tecEdit.map((t, i) => `<div class="cfg-tec" data-i="${i}">
        <input value="${esc(t)}" placeholder="Nombre y apellido">
        <button type="button" class="btn tiny danger" data-tec="borrar">✕</button>
      </div>`).join('')}
      <button type="button" class="btn small ghost" data-tec="agregar">+ Agregar técnico</button>
    </div>`;
}

// ===================== CITAS Y MENSAJES =====================
let msgEdit = null;   // { mensajes: {...}, motivos: [...] }
let msgDirty = false;
const TITULOS_MENSAJES = {
  citaCliente: 'Recordatorio de cita al cliente',
  citaEquipo: 'Aviso de cita al grupo del equipo',
  aceite: 'Recordatorio de cambio de aceite (3 meses)',
  aprobacionEquipo: 'Reparación aprobada: aviso al grupo del equipo',
  reparacion: 'Seguimiento de reparación (6 meses)',
};

function pintarCfgMensajes() {
  const m = msgEdit;
  $('#cfg-mensajes').innerHTML = `
    <div class="card cfg-barra">
      <div>
        <h2>Citas y mensajes</h2>
        <p class="hint" style="margin:0">Motivos de cita y textos de los mensajes de WhatsApp.</p>
      </div>
      <div class="cfg-acciones">
        <button type="button" class="btn primary" data-msg="guardar">${msgDirty ? 'Guardar •' : 'Guardar'}</button>
      </div>
    </div>
    <div class="card">
      <h3>Motivos de cita</h3>
      <p class="hint">Aparecen en la lista "Motivo" al agendar una cita. La opción <strong>"Otro"</strong> siempre está disponible y permite escribir el motivo.</p>
      ${m.motivos.map((t, i) => `<div class="cfg-tec" data-i="${i}">
        <input data-msg-motivo value="${esc(t)}" placeholder="Ej: Alineación y balanceo">
        <button type="button" class="btn tiny ghost" data-msg="subir" title="Subir">↑</button>
        <button type="button" class="btn tiny ghost" data-msg="bajar" title="Bajar">↓</button>
        <button type="button" class="btn tiny danger" data-msg="borrar-motivo" title="Quitar">✕</button>
      </div>`).join('')}
      <button type="button" class="btn small ghost" data-msg="agregar-motivo">+ Agregar motivo</button>
    </div>
    ${Object.entries(TITULOS_MENSAJES).map(([k, titulo]) => `
      <div class="card cfg-mensaje" data-k="${k}">
        <div class="form-head"><h3>${titulo}</h3><button type="button" class="btn tiny ghost" data-msg="restaurar">Restaurar texto original</button></div>
        <textarea data-msg-texto rows="6">${esc(m.mensajes[k])}</textarea>
        <p class="hint">Variables disponibles (se reemplazan al enviar): ${VARIABLES_MENSAJES[k].map((v) => `<button type="button" class="var-chip" data-msg="var" data-var="${v}">{${v}}</button>`).join(' ')}</p>
        <div class="mensaje cfg-vista" data-vista></div>
      </div>`).join('')}`;
  $$('#cfg-mensajes .cfg-mensaje').forEach(vistaPreviaMensaje);
}

// Vista previa con datos de ejemplo
function vistaPreviaMensaje(card) {
  const k = card.dataset.k;
  const ejemplo = { nombre: 'Carlos', vehiculo: 'Toyota Prado S150', placa: 'AB123CD', fecha: 'martes 18 de noviembre', hora: '9:30 a. m.', motivo: 'cambio de aceite', km: '150.000 km', taller: CONFIG.taller, direccion: EMPRESA.direccion, tecnico: 'Wilmer González', items: '-Mesetas superiores\n-Mesetas inferiores', numero: '#0005' };
  const txt = msgEdit.mensajes[k].replace(/\{(\w+)\}/g, (_, v) => ejemplo[v] ?? `{${v}}`);
  card.querySelector('[data-vista]').textContent = 'Vista previa: ' + txt;
}

async function guardarCfgMensajes() {
  const motivos = msgEdit.motivos.map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== 'otro');
  if (!motivos.length) { alert('Debe haber al menos un motivo de cita.'); return; }
  for (const [k, t] of Object.entries(msgEdit.mensajes)) if (!t.trim()) { alert(`El mensaje "${TITULOS_MENSAJES[k]}" está vacío. Escribe un texto o restaura el original.`); return; }
  db.config.motivosCita = motivos;
  db.config.mensajes = { ...msgEdit.mensajes };
  msgEdit.motivos = [...motivos]; msgDirty = false;
  await guardar();
  pintarCfgMensajes();
  toast('Motivos y mensajes guardados');
}

// ===================== PLANTILLAS DE PRESUPUESTO =====================
let plEdit = null;
let plDirty = false;

function pintarCfgPlantillas() {
  $('#cfg-plantillas').innerHTML = `
    <div class="card cfg-barra">
      <div>
        <h2>Plantillas de presupuesto</h2>
        <p class="hint" style="margin:0">Presupuestos pre-armados. Al usarlos solo se agregan los nombres de los ítems; luego ajustas cantidades, precios y nombres.</p>
      </div>
      <div class="cfg-acciones">
        <button type="button" class="btn small ghost" data-pl="nueva">+ Nueva plantilla</button>
        <button type="button" class="btn primary" data-pl="guardar">${plDirty ? 'Guardar •' : 'Guardar'}</button>
      </div>
    </div>
    ${plEdit.map((pl, p) => `
      <div class="card cfg-seccion" data-p="${p}">
        <div class="cfg-sec-cab">
          <input data-pl-campo="nombre" value="${esc(pl.nombre)}" placeholder="Nombre de la plantilla (ej: Entonación básica)">
          <button type="button" class="btn tiny danger" data-pl="borrar">Eliminar plantilla</button>
        </div>
        ${pl.items.map((it, i) => `
          <div class="cfg-tec" data-i="${i}">
            <span class="cfg-num">${i + 1}</span>
            <input data-pl-campo="item" value="${esc(it)}" placeholder="Nombre del ítem">
            <button type="button" class="btn tiny ghost" data-pl="subir" title="Subir">↑</button>
            <button type="button" class="btn tiny ghost" data-pl="bajar" title="Bajar">↓</button>
            <button type="button" class="btn tiny danger" data-pl="borrar-item" title="Quitar">✕</button>
          </div>`).join('')}
        <button type="button" class="btn small ghost" data-pl="agregar-item">+ Agregar ítem</button>
      </div>`).join('') || '<div class="card"><p class="vacio">No hay plantillas. Pulsa "+ Nueva plantilla".</p></div>'}`;
}

function marcarPl() { plDirty = true; const b = $('#cfg-plantillas [data-pl="guardar"]'); if (b) b.textContent = 'Guardar •'; }

async function guardarCfgPlantillas() {
  const limpias = [];
  for (const pl of plEdit) {
    const nombre = (pl.nombre || '').trim();
    const items = pl.items.map((x) => (x || '').trim()).filter(Boolean);
    if (!nombre && !items.length) continue;
    if (!nombre) { alert('Hay una plantilla sin nombre. Escríbele un nombre o elimínala.'); return; }
    if (!items.length) { alert(`La plantilla "${nombre}" no tiene ítems.`); return; }
    limpias.push({ id: pl.id, nombre, items });
  }
  db.config.plantillasPres = limpias;
  plEdit = copiar(limpias); plDirty = false;
  await guardar();
  pintarCfgPlantillas();
  toast('Plantillas guardadas');
}

// ===================== EVENTOS =====================
function initConfiguracion() {
  const cm = $('#cfg-mensajes');
  const marcarMsg = () => { msgDirty = true; const b = $('#cfg-mensajes [data-msg="guardar"]'); if (b) b.textContent = 'Guardar •'; };
  cm.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-msg-motivo]')) { msgEdit.motivos[Number(t.closest('[data-i]').dataset.i)] = t.value; marcarMsg(); }
    if (t.matches('[data-msg-texto]')) { const card = t.closest('[data-k]'); msgEdit.mensajes[card.dataset.k] = t.value; vistaPreviaMensaje(card); marcarMsg(); }
  });
  cm.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-msg]'); if (!b) return;
    const i = Number(b.closest('[data-i]')?.dataset.i);
    const mover = (arr, a, d) => { const j = a + d; if (j < 0 || j >= arr.length) return; [arr[a], arr[j]] = [arr[j], arr[a]]; };
    switch (b.dataset.msg) {
      case 'guardar': await guardarCfgMensajes(); return;
      case 'agregar-motivo': msgEdit.motivos.push(''); break;
      case 'borrar-motivo': msgEdit.motivos.splice(i, 1); break;
      case 'subir': mover(msgEdit.motivos, i, -1); break;
      case 'bajar': mover(msgEdit.motivos, i, 1); break;
      case 'restaurar': {
        const k = b.closest('[data-k]').dataset.k;
        if (!await confirmar(`¿Restaurar el texto original de "${TITULOS_MENSAJES[k]}"?`)) return;
        msgEdit.mensajes[k] = MENSAJES_INICIALES[k]; break;
      }
      case 'var': {
        // Insertar la variable donde está el cursor
        const ta = b.closest('[data-k]').querySelector('textarea');
        const ins = `{${b.dataset.var}}`; const p = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd ?? p);
        ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      default: return;
    }
    marcarMsg(); pintarCfgMensajes();
    if (b.dataset.msg === 'agregar-motivo') $$('#cfg-mensajes [data-msg-motivo]').at(-1)?.focus();
  });

  const pl = $('#cfg-plantillas');
  pl.addEventListener('input', (e) => {
    const t = e.target; const campo = t.dataset.plCampo; if (!campo) return;
    const p = Number(t.closest('[data-p]').dataset.p);
    if (campo === 'nombre') plEdit[p].nombre = t.value;
    else plEdit[p].items[Number(t.closest('[data-i]').dataset.i)] = t.value;
    marcarPl();
  });
  pl.addEventListener('keydown', (e) => {
    // Enter en un ítem agrega otro debajo
    if (e.key !== 'Enter' || e.target.dataset.plCampo !== 'item') return;
    e.preventDefault();
    const p = Number(e.target.closest('[data-p]').dataset.p); const i = Number(e.target.closest('[data-i]').dataset.i);
    plEdit[p].items.splice(i + 1, 0, ''); marcarPl(); pintarCfgPlantillas();
    $(`#cfg-plantillas [data-p="${p}"] [data-i="${i + 1}"] input`)?.focus();
  });
  pl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pl]'); if (!b) return;
    const p = Number(b.closest('[data-p]')?.dataset.p); const i = Number(b.closest('[data-i]')?.dataset.i);
    const mover = (arr, a, d) => { const j = a + d; if (j < 0 || j >= arr.length) return; [arr[a], arr[j]] = [arr[j], arr[a]]; };
    switch (b.dataset.pl) {
      case 'guardar': await guardarCfgPlantillas(); return;
      case 'nueva': plEdit.push({ id: claveNueva('pl'), nombre: '', items: [''] }); break;
      case 'borrar': if (!await confirmar(`¿Eliminar la plantilla "${plEdit[p].nombre || 'sin nombre'}"?`)) return; plEdit.splice(p, 1); break;
      case 'agregar-item': plEdit[p].items.push(''); break;
      case 'borrar-item': plEdit[p].items.splice(i, 1); break;
      case 'subir': mover(plEdit[p].items, i, -1); break;
      case 'bajar': mover(plEdit[p].items, i, 1); break;
      default: return;
    }
    marcarPl(); pintarCfgPlantillas();
    if (['nueva', 'agregar-item'].includes(b.dataset.pl)) $$('#cfg-plantillas input').filter((x) => !x.value).at(-1)?.focus();
  });

  $('#btn-ir-config').onclick = abrirConfiguracion;
  $$('.subtab[data-cfgtab]').forEach((b) => (b.onclick = () => irSubtabCfg(b.dataset.cfgtab)));

  const p = $('#cfg-puntos');
  p.addEventListener('input', (e) => {
    const jc = e.target.dataset.jcampo;
    if (jc === 'n' || jc === 'opn') {
      const j = cfgEdit.botones[Number(e.target.closest('[data-jb]').dataset.jb)];
      if (jc === 'n') j.n = e.target.value;
      else { const o = j.op[Number(e.target.closest('[data-op]').dataset.op)]; o.n = e.target.value; const m = e.target.parentElement.querySelector('.cfg-op-muestra'); if (m) m.textContent = o.n || 'Botón'; }
      marcarCfg();
    }
  });
  p.addEventListener('input', (e) => {
    const t = e.target; const campo = t.dataset.campo; if (!campo || campo === 'tipo') return;
    const g = t.closest('[data-g]')?.dataset.g; const s = Number(t.closest('[data-s]')?.dataset.s);
    const sec = cfgEdit[g][s];
    if (campo === 't') sec.t = t.value;
    else {
      const it = sec.items[Number(t.closest('[data-i]').dataset.i)];
      if (campo === 'subn') it.sub[Number(t.closest('[data-sub]').dataset.sub)].n = t.value;
      else it[campo] = t.value;
    }
    marcarCfg();
  });
  p.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.jcampo === 'opg') {
      const j = cfgEdit.botones[Number(t.closest('[data-jb]').dataset.jb)];
      j.op[Number(t.closest('[data-op]').dataset.op)].g = t.value; marcarCfg(); pintarCfgPuntos(); return;
    }
    if (t.dataset.campo === 'juego') {
      const g = t.closest('[data-g]').dataset.g; const s = Number(t.closest('[data-s]').dataset.s);
      cfgEdit[g][s].items[Number(t.closest('[data-i]').dataset.i)].juego = t.value; marcarCfg(); return;
    }
    if (t.dataset.campo !== 'tipo') return;
    const g = t.closest('[data-g]').dataset.g; const s = Number(t.closest('[data-s]').dataset.s);
    const it = cfgEdit[g][s].items[Number(t.closest('[data-i]').dataset.i)];
    it.tipo = t.value;
    if (it.tipo === 'traseras' && !it.kTras) { it.kTras = it.k + '_tras'; it.nTras = it.nTras || ''; }
    if ((it.tipo === 'fugas' || it.tipo === 'fluidos') && !(it.sub || []).length) it.sub = [{ k: claveNueva('s'), n: '' }];
    if (it.tipo === 'botones' && !(cfgEdit.botones || []).some((j) => j.id === it.juego)) it.juego = cfgEdit.botones?.[0]?.id || '';
    marcarCfg(); pintarCfgPuntos();
  });
  p.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cfg]'); if (!b) return;
    const accion = b.dataset.cfg;
    const g = b.closest('[data-g]')?.dataset.g;
    const s = Number(b.closest('[data-s]')?.dataset.s);
    const i = Number(b.closest('[data-i]')?.dataset.i);
    const secs = g ? cfgEdit[g] : null;
    const mover = (arr, a, d) => { const j = a + d; if (j < 0 || j >= arr.length) return; [arr[a], arr[j]] = [arr[j], arr[a]]; };
    switch (accion) {
      case 'guardar': await guardarCfgPuntos(); return;
      case 'restaurar':
        if (!await confirmar('¿Volver a los puntos de revisión originales? Se perderán los cambios hechos en esta lista.')) return;
        cfgEdit = { ...copiar(CONFIG_REVISION_INICIAL), botones: cfgEdit.botones || [] }; break;
      case 'agregar-sec': secs.push({ t: 'Nueva sección', items: [{ k: claveNueva('p'), n: '', tipo: 'normal' }] }); break;
      case 'subir-sec': mover(secs, s, -1); break;
      case 'bajar-sec': mover(secs, s, 1); break;
      case 'borrar-sec':
        if (!await confirmar(`¿Eliminar la sección "${secs[s].t}" y sus ${secs[s].items.length} punto(s)?`)) return;
        secs.splice(s, 1); break;
      case 'agregar-item': secs[s].items.push({ k: claveNueva('p'), n: '', tipo: 'normal' }); break;
      case 'subir': mover(secs[s].items, i, -1); break;
      case 'bajar': mover(secs[s].items, i, 1); break;
      case 'borrar-item':
        if (!await confirmar(`¿Eliminar el punto "${secs[s].items[i].n || 'sin nombre'}"?`)) return;
        secs[s].items.splice(i, 1); break;
      case 'agregar-sub': secs[s].items[i].sub.push({ k: claveNueva('s'), n: '' }); break;
      case 'borrar-sub': secs[s].items[i].sub.splice(Number(b.closest('[data-sub]').dataset.sub), 1); break;
      case 'agregar-juego':
        (cfgEdit.botones = cfgEdit.botones || []).push({ id: claveNueva('jb'), n: '', op: [{ n: 'Sí', g: 'reemplazo' }, { n: 'No', g: 'bueno' }] }); break;
      case 'borrar-juego': {
        const jb = Number(b.closest('[data-jb]').dataset.jb); const j = cfgEdit.botones[jb];
        const usan = ['basica', 'completa'].flatMap((gg) => cfgEdit[gg].flatMap((sec) => sec.items)).filter((it) => it.tipo === 'botones' && it.juego === j.id);
        if (!await confirmar(`¿Eliminar el juego "${j.n || 'sin nombre'}"?${usan.length ? `
${usan.length} punto(s) que lo usan volverán a los 4 botones normales.` : ''}`)) return;
        usan.forEach((it) => { it.tipo = 'normal'; delete it.juego; });
        cfgEdit.botones.splice(jb, 1); break;
      }
      case 'agregar-op': cfgEdit.botones[Number(b.closest('[data-jb]').dataset.jb)].op.push({ n: '', g: 'bueno' }); break;
      case 'borrar-op': cfgEdit.botones[Number(b.closest('[data-jb]').dataset.jb)].op.splice(Number(b.closest('[data-op]').dataset.op), 1); break;
      default: return;
    }
    marcarCfg(); pintarCfgPuntos();
    // Al agregar algo, poner el cursor en el campo nuevo (el último vacío)
    if (accion.startsWith('agregar')) $$('#cfg-puntos input[data-campo="n"], #cfg-puntos input[data-campo="subn"], #cfg-puntos input[data-jcampo]').filter((x) => !x.value).at(-1)?.focus();
  });

  const t = $('#cfg-tecnicos');
  t.addEventListener('input', (e) => { const row = e.target.closest('[data-i]'); if (!row) return; tecEdit[Number(row.dataset.i)] = e.target.value; tecDirty = true; });
  t.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tec]'); if (!b) return;
    if (b.dataset.tec === 'agregar') { tecEdit.push(''); tecDirty = true; pintarCfgTecnicos(); $$('#cfg-tecnicos input').at(-1).focus(); return; }
    if (b.dataset.tec === 'borrar') { tecEdit.splice(Number(b.closest('[data-i]').dataset.i), 1); tecDirty = true; pintarCfgTecnicos(); return; }
    if (b.dataset.tec === 'guardar') {
      const lista = tecEdit.map((x) => x.trim()).filter(Boolean);
      if (!lista.length) { alert('Debe haber al menos un técnico.'); return; }
      db.config.tecnicos = lista; tecEdit = [...lista]; tecDirty = false;
      await guardar(); pintarCfgTecnicos();
      if (typeof rvEdit !== 'undefined' && rvEdit && $('#rv-tecnico')) { leerCabeceraRev(); pintarEditorRev(); }
      toast('Técnicos guardados');
    }
  });

  window.addEventListener('beforeunload', (e) => { if (cfgDirty || tecDirty || plDirty || msgDirty) { e.preventDefault(); e.returnValue = ''; } });
}

initConfiguracion();

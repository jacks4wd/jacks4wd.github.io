/* Jacks4WD – Registro de clientes, cambios de aceite, recordatorios y citas.
 * Funciona sin instalar nada: se abre index.html en Chrome o Edge.
 * Los datos se guardan en datos/taller.json (carpeta conectada) y,
 * como respaldo, en el almacenamiento del navegador.
 */

// ===================== CONFIGURACIÓN =====================
const CONFIG = {
  taller: 'Jacks4WD',
  codigoPais: '58',      // Venezuela
  mesesRecordatorio: 3,
  kmIntervalo: 6000,
  diasPorVencer: 15,
  archivoDatos: 'taller.json',
};

// ---------- Mensajes de WhatsApp editables (⚙ Configuración → Citas y mensajes) ----------
// Se escriben con "variables" entre llaves que la app reemplaza al enviar.
const MENSAJES_INICIALES = {
  aceite: 'Hola {nombre}, el último cambio de aceite de tu vehículo {vehiculo} fue el {fecha} con {km}. ' +
    'Este servicio se recomienda cada 3 meses o 6.000 km.\n\n' +
    'En {taller} nos preocupamos por tu vehículo: revisa el kilometraje actual y agenda tu cita respondiendo a este mensaje.\n\n— {taller}',
  citaCliente: 'Hola {nombre}, te recordamos tu cita en {taller} el {fecha} a las {hora} para {motivo} de tu {vehiculo}.\n\n' +
    'Te esperamos en {direccion}. Si necesitas cambiar la fecha u hora, respóndenos este mensaje.\n\n— {taller}',
  citaEquipo: '*Cita agendada* — {taller}\nVehículo: {vehiculo} · {placa}\nFecha: {fecha} · {hora}\nMotivo: {motivo}',
  aprobacionEquipo: '{vehiculo} · {placa}\nTécnico: {tecnico}\n*Reparación aprobada:*\n{items}',
  reparacion: 'Hola {nombre}, han pasado 6 meses desde la última reparación de tu {vehiculo} ({fecha}). ' +
    'Para mantenerlo en óptimas condiciones te invitamos a una revisión de seguimiento, sin costo adicional.\n\n' +
    'Responde este mensaje para agendar tu cita.\n\n— {taller}',
};
const VARIABLES_MENSAJES = {
  aceite: ['nombre', 'vehiculo', 'placa', 'fecha', 'km', 'taller'],
  citaCliente: ['nombre', 'vehiculo', 'placa', 'fecha', 'hora', 'motivo', 'taller', 'direccion'],
  citaEquipo: ['vehiculo', 'placa', 'fecha', 'hora', 'motivo', 'taller'],
  reparacion: ['nombre', 'vehiculo', 'placa', 'fecha', 'taller'],
  aprobacionEquipo: ['vehiculo', 'placa', 'tecnico', 'items', 'numero', 'taller'],
};
const MOTIVOS_CITA_INICIALES = ['Cambio de aceite', 'Revisión general', 'Frenos', 'Suspensión', 'Diagnóstico', 'Presupuesto'];

function textoMensaje(clave) {
  const m = db.config?.mensajes?.[clave];
  return typeof m === 'string' && m.trim() ? m : MENSAJES_INICIALES[clave];
}
// Reemplaza {variable} por su valor; las variables vacías se quitan con su espacio
function rellenarMensaje(clave, vars) {
  const base = { taller: CONFIG.taller, direccion: typeof EMPRESA !== 'undefined' ? EMPRESA.direccion : '', ...vars };
  return textoMensaje(clave).replace(/\{(\w+)\}/g, (_, k) => (base[k] ?? '').toString()).replace(/ {2,}/g, ' ').replace(/ ([,.])/g, '$1');
}
function motivosCita() {
  const m = db.config?.motivosCita;
  return Array.isArray(m) && m.length ? m : MOTIVOS_CITA_INICIALES;
}

function mensajeRecordatorio(cliente, vehiculo, servicio) {
  return rellenarMensaje('aceite', {
    nombre: cliente.nombre, vehiculo: `${vehiculo.marca} ${vehiculo.modelo}`, placa: vehiculo.placa,
    fecha: fmtFecha(servicio.fecha), km: fmtKm(servicio.km),
  });
}

// Plantillas para el envío manual de mensajes (se pueden editar antes de enviar).
const PLANTILLAS = {
  recordatorio: { nombre: 'Recordatorio de cambio de aceite', texto: (c, v, s) => s ? mensajeRecordatorio(c, v, s) : null },
  libre: { nombre: 'Mensaje libre', texto: (c) => `Hola ${c.nombre}, \n\n— ${CONFIG.taller}` },
  prueba: { nombre: 'Mensaje de prueba', texto: (c) => `Hola ${c.nombre}, este es un mensaje de prueba del sistema de ${CONFIG.taller}.` },
};

// ---------- Aceites ----------
const MARCAS_ACEITE = ['Motul'];               // marcas preconfiguradas (más "Otra marca…")
const TIPOS_ACEITE = ['Mineral', 'Semi-sintético', 'Sintético'];
const VISCOSIDADES = ['0W-20', '0W-30', '0W-40', '5W-20', '5W-30', '5W-40', '10W-30', '10W-40', '15W-40', '15W-50', '20W-50'];
// Catálogo inicial (se puede editar y ampliar en la pestaña "Aceites").
const CATALOGO_INICIAL = [
  ['Motul', '4100 Turbolight', '10W-40', 'Semi-sintético'],
  ['Motul', '4100 Power', '15W-50', 'Semi-sintético'],
  ['Motul', '4100 Syn-nergy Spec', '10W-40', 'Semi-sintético'],
  ['Motul', '4100 Syn-nergy', '15W-40', 'Semi-sintético'],
  ['Motul', '8100 X-clean', '5W-30', 'Sintético'],
  ['Motul', '8100 X-clean', '5W-40', 'Sintético'],
  ['Motul', '8100 X-clean+', '5W-30', 'Sintético'],
  ['Motul', '8100 X-cess', '5W-30', 'Sintético'],
  ['Motul', '8100 X-cess', '5W-40', 'Sintético'],
  ['Motul', '8100 Eco-nergy', '0W-30', 'Sintético'],
  ['Motul', '8100 Eco-nergy', '5W-30', 'Sintético'],
  ['Motul', '8100 X-max', '0W-40', 'Sintético'],
];
// Fotos oficiales incluidas en img/aceites (se usan si el producto no tiene foto propia).
const FOTOS_PREDETERMINADAS = {
  'motul|4100turbolight|10w-40': 'motul-4100-turbolight-10w40.png',
  'motul|4100power|15w-50': 'motul-4100-power-15w50.png',
  'motul|4100syn-nergyspec|10w-40': 'motul-4100-syn-nergy-spec-10w40.png',
  'motul|4100syn-nergy|15w-40': 'motul-4100-syn-nergy-15w40.png',
  'motul|8100x-clean|5w-40': 'motul-8100-x-clean-5w40.png',
  'motul|8100x-clean+|5w-30': 'motul-8100-x-clean-plus-5w30.png',
  'motul|8100x-cess|5w-30': 'motul-8100-x-cess-5w30.png',
  'motul|8100x-cess|5w-40': 'motul-8100-x-cess-5w40.png',
  'motul|8100eco-nergy|0w-30': 'motul-8100-eco-nergy-0w30.png',
  'motul|8100eco-nergy|5w-30': 'motul-8100-eco-nergy-5w30.png',
  'motul|8100x-max|0w-40': 'motul-8100-x-max-0w40.png',
};
function fotoPredeterminada(a) {
  const clave = [a.marca, a.linea, a.viscosidad].map((x) => norm(x).replace(/\s+/g, '')).join('|');
  return FOTOS_PREDETERMINADAS[clave] ? 'img/aceites/' + FOTOS_PREDETERMINADAS[clave] : '';
}
function srcFoto(a) { return a.foto || fotoPredeterminada(a); }

function catalogoInicial() {
  return CATALOGO_INICIAL.map(([marca, linea, viscosidad, tipo], i) => ({ id: 'ac' + i + Math.random().toString(36).slice(2, 6), marca, linea, viscosidad, tipo, foto: '' }));
}

const TIPOS_CITA = ['Cambio de aceite', 'Revisión general', 'Frenos', 'Suspensión', 'Diagnóstico', 'Presupuesto', 'Otro'];

// ===================== ESTADO =====================
const LS_KEY = 'jacks4wd-db';
let db = vacio();
let dirHandle = null;
let fileHandle = null;

function vacio() {
  return { version: 1, actualizado: null, clientes: [], vehiculos: [], servicios: [], citas: [], mensajes: [], aceites: catalogoInicial(), presupuestos: [], revisiones: [], reparaciones: [], ingresos: [], config: {} };
}

// Estructura de puntos de revisión: solo claves seguras y tipos conocidos
function limpiarEstructura(e) {
  const CLAVE = /^[a-z0-9_]{1,40}$/;
  const TIPOS = ['normal', 'vida', 'medida', 'traseras', 'fugas', 'fluidos'];
  const txt = (v, max = 120) => String(v ?? '').slice(0, max);
  const vistos = new Set();
  const secciones = (lista) => (Array.isArray(lista) ? lista : []).filter((s) => s && typeof s === 'object').map((s) => ({
    t: txt(s.t),
    items: (Array.isArray(s.items) ? s.items : []).filter((it) => it && CLAVE.test(it.k) && !vistos.has(it.k) && vistos.add(it.k)).map((it) => {
      const out = { k: it.k, n: txt(it.n), tipo: TIPOS.includes(it.tipo) ? it.tipo : 'normal' };
      if (it.medida) out.medida = txt(it.medida);
      if (it.naTexto) out.naTexto = txt(it.naTexto, 40);
      if (out.tipo === 'traseras') { out.kTras = CLAVE.test(it.kTras) ? it.kTras : it.k + '_tras'; out.nTras = txt(it.nTras); }
      if (out.tipo === 'fugas' || out.tipo === 'fluidos') out.sub = (Array.isArray(it.sub) ? it.sub : []).filter((x) => x && CLAVE.test(x.k)).map((x) => ({ k: x.k, n: txt(x.n) }));
      return out;
    }),
  }));
  return { basica: secciones(e?.basica), completa: secciones(e?.completa) };
}

// ===================== VALIDACIÓN DE DATOS =====================
// Se aplica a todo lo que se carga (archivo, navegador o copia importada) para que
// un archivo dañado o manipulado no pueda inyectar código en la página.
function normalizarDatos(data) {
  const d = Object.assign(vacio(), data && typeof data === 'object' ? data : {});
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const FECHA = /^\d{4}-\d{2}-\d{2}$/;
  const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
  const fecha = (v) => (typeof v === 'string' && FECHA.test(v) ? v : null);
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  ['clientes', 'vehiculos', 'servicios', 'citas', 'mensajes', 'aceites', 'presupuestos', 'revisiones', 'reparaciones', 'ingresos'].forEach((k) => (d[k] = lista(d[k])));
  const todos = [...d.clientes, ...d.vehiculos, ...d.servicios, ...d.citas, ...d.mensajes, ...d.aceites, ...d.presupuestos, ...d.revisiones, ...d.reparaciones, ...d.ingresos];
  todos.forEach((x) => { if (!id(x.id)) x.id = nuevoId(); });

  d.vehiculos.forEach((v) => { v.clienteId = id(v.clienteId); });
  d.servicios.forEach((s) => {
    s.vehiculoId = id(s.vehiculoId); s.aceiteId = id(s.aceiteId) || '';
    s.fecha = fecha(s.fecha) || hoyISO(); s.recordatorioEnviado = fecha(s.recordatorioEnviado);
    s.km = num(s.km); s.proximoKm = num(s.proximoKm);
    s.creado = typeof s.creado === 'string' ? s.creado : '';
  });
  d.citas.forEach((c) => {
    c.vehiculoId = id(c.vehiculoId); c.fecha = fecha(c.fecha) || hoyISO();
    if (!['pendiente', 'completada', 'cancelada'].includes(c.estado)) c.estado = 'pendiente';
    c.hora = /^\d{2}:\d{2}$/.test(c.hora || '') ? c.hora : '';
    c.avisoCliente = fecha(c.avisoCliente); c.avisoGrupo = fecha(c.avisoGrupo);
    c.motivoOtro = String(c.motivoOtro || '').slice(0, 120);
  });
  d.mensajes.forEach((m) => { m.vehiculoId = id(m.vehiculoId); m.reparacionId = id(m.reparacionId); m.fecha = fecha(m.fecha) || hoyISO(); m.creado = String(m.creado || ''); });
  d.aceites.forEach((a) => {
    // Fotos: solo imágenes incrustadas o las incluidas en img/aceites
    const f = String(a.foto || '');
    a.foto = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(f) || /^img\/aceites\/[A-Za-z0-9._-]+$/.test(f) ? f : '';
  });
  // Configuración (puntos de revisión y técnicos)
  d.config = d.config && typeof d.config === 'object' ? d.config : {};
  if (d.config.revision) d.config.revision = limpiarEstructura(d.config.revision);
  if (Array.isArray(d.config.tecnicos)) d.config.tecnicos = d.config.tecnicos.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 50);
  else delete d.config.tecnicos;
  if (d.config.mensajes && typeof d.config.mensajes === 'object') {
    const m = {};
    ['aceite', 'citaCliente', 'citaEquipo', 'reparacion', 'aprobacionEquipo'].forEach((k) => { if (typeof d.config.mensajes[k] === 'string') m[k] = d.config.mensajes[k].slice(0, 2000); });
    d.config.mensajes = m;
  } else delete d.config.mensajes;
  if (Array.isArray(d.config.motivosCita)) d.config.motivosCita = d.config.motivosCita.map((x) => String(x || '').trim().slice(0, 80)).filter((x) => x && x !== 'Otro').slice(0, 50);
  else delete d.config.motivosCita;
  if (Array.isArray(d.config.plantillasPres)) {
    d.config.plantillasPres = d.config.plantillasPres.filter((p) => p && typeof p === 'object' && id(p.id)).slice(0, 100).map((p) => ({
      id: p.id, nombre: String(p.nombre || '').slice(0, 120),
      items: (Array.isArray(p.items) ? p.items : []).map((x) => String(x || '').slice(0, 200)).filter(Boolean).slice(0, 100),
    }));
  } else delete d.config.plantillasPres;

  d.revisiones.forEach((r) => {
    if (r.estructura) r.estructura = limpiarEstructura(r.estructura);
    r.vehiculoId = id(r.vehiculoId); r.fecha = fecha(r.fecha) || hoyISO();
    r.numero = Math.max(0, Math.floor(num(r.numero) || 0));
    if (!['basica', 'completa'].includes(r.tipo)) r.tipo = 'basica';
    if (!['abierta', 'cerrada', 'cancelada'].includes(r.estado)) r.estado = 'abierta';
    r.fechaCierre = fecha(r.fechaCierre);
    r.tecnico = String(r.tecnico || ''); r.observaciones = String(r.observaciones || ''); r.km = num(r.km);
    r.diagnosticoEnviado = fecha(r.diagnosticoEnviado);
    const CLAVE = /^[a-z0-9_]{1,40}$/;
    const items = {};
    Object.entries(r.items && typeof r.items === 'object' ? r.items : {}).forEach(([k, it]) => {
      if (!CLAVE.test(k) || !it || typeof it !== 'object') return;
      const e = ['reemplazo', 'regular', 'bueno', 'na', 'si', 'no'].includes(it.e) ? it.e : '';
      const nivel = ['optimo', 'falta'].includes(it.nivel) ? it.nivel : '';
      const estadoF = ['optimo', 'reemplazar'].includes(it.estadoF) ? it.estadoF : '';
      if (!e && !nivel && !estadoF) return;
      const limpio = { e, nota: String(it.nota || ''), medida: String(it.medida || '') };
      if (nivel) limpio.nivel = nivel;
      if (estadoF) limpio.estadoF = estadoF;
      if (it.fugas && typeof it.fugas === 'object') { limpio.fugas = {}; Object.entries(it.fugas).forEach(([f, l]) => { if (CLAVE.test(f)) limpio.fugas[f] = String(l || ''); }); }
      items[k] = limpio;
    });
    r.items = items;
    const op = r.opciones && typeof r.opciones === 'object' ? r.opciones : {};
    const tras = {}; Object.entries(op.traseras || {}).forEach(([k, v]) => { if (CLAVE.test(k)) tras[k] = !!v; });
    r.opciones = { traseras: tras, fluidos: (Array.isArray(op.fluidos) ? op.fluidos : []).filter((f) => typeof f === 'string' && CLAVE.test(f)) };
  });
  d.presupuestos.forEach((p) => {
    p.revisionId = id(p.revisionId);
    p.vehiculoId = id(p.vehiculoId); p.fecha = fecha(p.fecha) || hoyISO();
    p.numero = Math.max(0, Math.floor(num(p.numero) || 0));
    if (!['pendiente', 'aprobado', 'rechazado'].includes(p.estado)) p.estado = 'pendiente';
    p.items = lista(p.items).map((it) => ({ ...it, cant: num(it.cant) ?? 0, precio: num(it.precio) }));
    p.reparacionId = id(p.reparacionId);
    if (p.origen && typeof p.origen === 'object') p.origen = { reparacionId: id(p.origen.reparacionId), presupuestoId: id(p.origen.presupuestoId) }; else delete p.origen;
    if (p.aprobacion && typeof p.aprobacion === 'object') {
      p.aprobacion = {
        fecha: fecha(p.aprobacion.fecha) || hoyISO(), tecnico: String(p.aprobacion.tecnico || ''), equipoInformado: fecha(p.aprobacion.equipoInformado),
        items: lista(p.aprobacion.items).map((it) => ({ cant: num(it.cant) ?? 0, unidad: String(it.unidad || ''), desc: String(it.desc || ''), sku: String(it.sku || ''), precio: num(it.precio) ?? 0, aprobado: !!it.aprobado })),
      };
    } else delete p.aprobacion;
  });
  d.reparaciones.forEach((r) => {
    r.presupuestoId = id(r.presupuestoId); r.vehiculoId = id(r.vehiculoId);
    r.fecha = fecha(r.fecha) || hoyISO();
    r.numero = Math.max(0, Math.floor(num(r.numero) || 0));
    r.presupuestoNumero = Math.max(0, Math.floor(num(r.presupuestoNumero) || 0));
    ['cliente', 'telefono', 'vehiculo', 'tecnico', 'notas', 'notaEntrega'].forEach((k) => (r[k] = String(r[k] || '')));
    if (r.estado === 'terminada') r.estado = 'culminado'; // nombre anterior
    if (!['reparacion', 'modificacion'].includes(r.tipo)) r.tipo = 'reparacion';
    if (!['en_proceso', 'culminado', 'cancelado'].includes(r.estado)) r.estado = 'en_proceso';
    r.fechaCierre = fecha(r.fechaCierre); r.cerradoPor = String(r.cerradoPor || '');
    r.items = lista(r.items).map((it) => ({ cant: num(it.cant) ?? 0, unidad: String(it.unidad || ''), desc: String(it.desc || ''), sku: String(it.sku || ''), estado: it.estado === 'aprobado' ? 'aprobado' : 'rechazado' }));
    r.ingresoId = id(r.ingresoId);
  });
  d.presupuestos.forEach((p) => { p.ingresoId = id(p.ingresoId); });
  d.ingresos.forEach((x) => {
    x.vehiculoId = id(x.vehiculoId); x.presupuestoId = id(x.presupuestoId); x.reparacionId = id(x.reparacionId);
    x.fecha = fecha(x.fecha) || hoyISO();
    x.numero = Math.max(0, Math.floor(num(x.numero) || 0));
    if (!['diagnostico', 'reparacion', 'modificacion'].includes(x.categoria)) x.categoria = 'diagnostico';
    if (!['abierta', 'cerrada', 'cancelada'].includes(x.estado)) x.estado = 'abierta';
    ['motivo', 'descripcion', 'tecnico'].forEach((k) => (x[k] = String(x[k] || '').slice(0, 5000)));
  });
  return d;
}

// ===================== UTILIDADES =====================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

function hoyISO() { return isoDe(new Date()); }
function isoDe(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtFecha(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
function sumarMeses(iso, n) {
  const d = parseISO(iso); const dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimo));
  return isoDe(d);
}
function diasEntre(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function fmtKm(n) { return n || n === 0 ? Number(n).toLocaleString('es-VE') + ' km' : '—'; }
// KM se escribe con o sin puntos (150.000 / 150000); solo cuentan los dígitos.
function parseKm(s) { const d = soloDigitos(s); return d ? Number(d) : NaN; }
function fmtNum(n) { return Number.isFinite(n) ? n.toLocaleString('es-VE') : ''; }

function telWhatsApp(tel) {
  let d = soloDigitos(tel);
  // Número internacional escrito con "+" o "00": se respeta tal cual.
  if (String(tel).trim().startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith(CONFIG.codigoPais) && d.length > 10) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return CONFIG.codigoPais + d;
}

// ---------- Abrir WhatsApp ----------
// Cada dispositivo elige qué WhatsApp usar (se recuerda en ese dispositivo):
//   business → WhatsApp Business (por defecto en teléfonos y tablets)
//   normal   → WhatsApp normal / WhatsApp Web (wa.me)
const ES_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ES_ANDROID = /Android/i.test(navigator.userAgent);
const ES_MOVIL = ES_IOS || ES_ANDROID;
const WA_KEY = 'jacks4wd-whatsapp';
function preferenciaWhatsApp() {
  try { return localStorage.getItem(WA_KEY) || (ES_MOVIL ? 'business' : 'normal'); } catch { return ES_MOVIL ? 'business' : 'normal'; }
}
function abrirWhatsApp(tel, texto) {
  const num = tel ? telWhatsApp(tel) : '';
  const t = encodeURIComponent(texto || '');
  const pref = preferenciaWhatsApp();
  let url;
  if (pref === 'business' && ES_ANDROID) {
    // Android: abrir directamente la app WhatsApp Business (paquete com.whatsapp.w4b)
    url = `intent://send?${num ? 'phone=' + num + '&' : ''}text=${t}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
  } else if (pref === 'business' && ES_IOS) {
    url = `whatsapp-business://send?${num ? 'phone=' + num + '&' : ''}text=${t}`;
  } else {
    url = `https://wa.me/${num}?text=${t}`;
  }
  if (ES_MOVIL) window.location.href = url; // en móviles abre la app directamente
  else window.open(url, '_blank', 'noopener');
}

// Menú pequeño para cambiar un estado desde un listado (se abre junto al botón)
function menuEstado(ancla, opciones, alElegir) {
  $('#menu-estado')?.remove();
  const m = document.createElement('div');
  m.id = 'menu-estado'; m.className = 'menu-estado';
  m.innerHTML = opciones.map((o) => `<button type="button" data-v="${esc(o.valor)}" class="estado-op ${esc(o.clase || '')}" ${o.actual ? 'disabled' : ''}>${esc(o.texto)}${o.actual ? ' (actual)' : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = ancla.getBoundingClientRect();
  m.style.top = (window.scrollY + r.bottom + 4) + 'px';
  m.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - m.offsetWidth - 8)) + 'px';
  const cerrar = (e) => { if (e && m.contains(e.target)) return; m.remove(); document.removeEventListener('click', cerrar, true); };
  setTimeout(() => document.addEventListener('click', cerrar, true), 0);
  m.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; m.remove(); document.removeEventListener('click', cerrar, true); alElegir(b.dataset.v); };
}

// Pide un dato en una ventana (devuelve el texto, o null si se cancela)
function pedirDato({ titulo, texto, etiqueta, valor = '', placeholder = '', boton = 'Aceptar' }) {
  return new Promise((resolver) => {
    abrirModal(`
      <h3>${esc(titulo)}</h3>
      ${texto ? `<p class="hint">${texto}</p>` : ''}
      <form id="form-dato"><label>${esc(etiqueta)}<input name="dato" value="${esc(valor)}" placeholder="${esc(placeholder)}" required></label>
        <div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" id="dato-cancelar">Cancelar</button><button class="btn primary">${esc(boton)}</button></div>
      </form>`);
    const f = $('#form-dato'); f.dato.focus(); f.dato.select();
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; cerrarModal(); resolver(v); };
    f.onsubmit = (e) => { e.preventDefault(); const v = f.dato.value.trim(); if (v) fin(v); };
    $('#dato-cancelar').onclick = () => fin(null);
    $('#modal').addEventListener('close', () => fin(null), { once: true });
  });
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

// Relaciones
const cliente = (id) => db.clientes.find((c) => c.id === id);
const vehiculo = (id) => db.vehiculos.find((v) => v.id === id);
const serviciosDe = (vid) => db.servicios.filter((s) => s.vehiculoId === vid).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
const ultimoServicio = (vid) => serviciosDe(vid)[0];

function estadoVehiculo(vid) {
  const s = ultimoServicio(vid);
  if (!s) return { clave: 'sin', texto: 'Sin servicios', vence: null };
  const vence = sumarMeses(s.fecha, CONFIG.mesesRecordatorio);
  const dias = diasEntre(hoyISO(), vence);
  if (dias <= 0) return { clave: 'vencido', texto: 'Vencido', vence, dias };
  if (dias <= CONFIG.diasPorVencer) return { clave: 'pronto', texto: `Vence en ${dias} d`, vence, dias };
  return { clave: 'aldia', texto: 'Al día', vence, dias };
}

// ===================== ALMACENAMIENTO =====================
// IndexedDB solo para recordar la carpeta conectada entre sesiones.
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('jacks4wd', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { try { const d = await idb(); return await new Promise((res) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch { return null; } }
async function idbSet(k, v) { try { const d = await idb(); d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch { /* ignorar */ } }

const soportaCarpeta = 'showDirectoryPicker' in window;

function setEstado(texto, clase) {
  const p = $('#estado-datos'); p.textContent = texto; p.className = 'pill ' + (clase || '');
}

async function abrirArchivoEnCarpeta(handle) {
  dirHandle = handle;
  fileHandle = await dirHandle.getFileHandle(CONFIG.archivoDatos, { create: true });
  const texto = await (await fileHandle.getFile()).text();
  if (texto.trim()) {
    db = normalizarDatos(JSON.parse(texto));
  } else {
    // Archivo nuevo: si había datos en el navegador, los pasamos al archivo.
    const local = leerLocal();
    if (local && (local.clientes.length || local.citas.length)) db = local;
    await guardar(false);
  }
  setEstado(`Guardando en ${dirHandle.name}/${CONFIG.archivoDatos}`, 'ok');
  $('#btn-conectar').textContent = 'Cambiar carpeta';
  renderTodo();
}

async function conectarCarpeta() {
  if (!soportaCarpeta) {
    alert('Este navegador no permite guardar en una carpeta. Usa Google Chrome o Microsoft Edge.\n\nMientras tanto los datos se guardan en el navegador; usa "Exportar copia" con frecuencia.');
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: 'jacks4wd-datos', mode: 'readwrite' });
    await idbSet('dir', h);
    await abrirArchivoEnCarpeta(h);
    toast('Carpeta conectada');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); alert('No se pudo abrir la carpeta: ' + e.message); }
  }
}

async function reconectar() {
  if (!soportaCarpeta) return false;
  const h = await idbGet('dir');
  if (!h) return false;
  const perm = await h.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') { await abrirArchivoEnCarpeta(h); return true; }
  // Necesita un clic del usuario para volver a dar permiso.
  setEstado('Haz clic en "Reconectar" para usar tu carpeta', 'warn');
  const btn = $('#btn-conectar');
  btn.textContent = `Reconectar (${h.name})`;
  btn.onclick = async () => {
    try {
      if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') {
        await abrirArchivoEnCarpeta(h);
        btn.onclick = conectarCarpeta;
      }
    } catch (e) { console.error(e); conectarCarpeta(); }
  };
  return true;
}

function leerLocal() {
  try { const t = localStorage.getItem(LS_KEY); return t ? normalizarDatos(JSON.parse(t)) : null; } catch { return null; }
}

const MODO_NUBE = typeof NUBE_CONFIG !== 'undefined' && !!NUBE_CONFIG.url;

async function guardar(render = true) {
  db.actualizado = new Date().toISOString();
  // Modo nube: cada cambio se sube a Supabase (nube.js); no se guarda copia en el dispositivo
  if (MODO_NUBE && typeof Nube !== 'undefined') {
    if (render) renderTodo();
    await Nube.sincronizar();
    return;
  }
  const json = JSON.stringify(db, null, 2);
  try { localStorage.setItem(LS_KEY, json); } catch { /* sin espacio */ }
  if (fileHandle) {
    try {
      const w = await fileHandle.createWritable();
      await w.write(json); await w.close();
    } catch (e) {
      console.error(e);
      setEstado('Error al guardar en la carpeta', 'warn');
      toast('⚠ No se pudo guardar en la carpeta. Los datos quedaron en el navegador.');
    }
  }
  if (render) renderTodo();
}

function exportar() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jacks4wd-respaldo-${hoyISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importar(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.clientes) || !Array.isArray(data.vehiculos)) throw new Error('Formato no válido');
    if (!confirm(`Esto reemplazará los datos actuales por los del archivo (${data.clientes.length} clientes). ¿Continuar?`)) return;
    db = normalizarDatos(data);
    await guardar();
    toast('Copia importada');
  } catch (e) { alert('No se pudo importar: ' + e.message); }
}

// ===================== PESTAÑAS =====================
function irA(tab) {
  // "Nuevo registro" y "Registros" ahora son subpestañas de "Servicios"
  if (tab === 'nuevo' || tab === 'registros') { irSubtabSv(tab === 'nuevo' ? 'nuevo' : 'historial'); tab = 'servicios'; }
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  window.scrollTo(0, 0);
}
function irSubtabSv(cual) {
  $$('.subtab[data-svtab]').forEach((b) => b.classList.toggle('active', b.dataset.svtab === cual));
  $('#sv-nuevo').hidden = cual !== 'nuevo';
  $('#sv-historial').hidden = cual !== 'historial';
}

// ===================== BÚSQUEDA =====================
function buscarVehiculos(q) {
  const t = norm(q).trim();
  if (!t) return [];
  const td = soloDigitos(q);
  return db.vehiculos.filter((v) => {
    const c = cliente(v.clienteId) || {};
    const texto = norm([c.nombre, v.placa, v.marca, v.modelo, v.color].join(' '));
    return texto.includes(t) || (td.length >= 3 && soloDigitos(c.telefono).includes(td));
  });
}

// ---------- Otro vehículo para un cliente ya registrado (citas, revisiones, presupuestos) ----------
function camposVehiculoHTML(d = {}) {
  return `<div class="grid campos-veh">
    <label>Marca *<input data-veh="marca" value="${esc(d.marca || '')}" list="lista-marcas"></label>
    <label>Modelo *<input data-veh="modelo" value="${esc(d.modelo || '')}"></label>
    <label>Placa *<input data-veh="placa" class="upper" value="${esc(d.placa || '')}"></label>
    <label>Año <span class="opt">(opcional)</span><input data-veh="anio" value="${esc(d.anio || '')}" inputmode="numeric" maxlength="4"></label>
    <label>Color <span class="opt">(opcional)</span><input data-veh="color" value="${esc(d.color || '')}"></label>
  </div>`;
}
function leerCamposVehiculo(cont) {
  const d = {};
  cont.querySelectorAll('[data-veh]').forEach((i) => (d[i.dataset.veh] = i.value.trim()));
  return d;
}
// Crea el vehículo para el cliente (o reutiliza el de la misma placa). Devuelve su id o null.
function crearVehiculoCliente(clienteId, d) {
  if (!d.marca || !d.modelo || !d.placa) { alert('Completa marca, modelo y placa del vehículo.'); return null; }
  const placa = d.placa.toUpperCase().replace(/\s+/g, '');
  const existente = db.vehiculos.find((v) => v.placa === placa);
  if (existente) {
    if (existente.clienteId === clienteId) return existente.id;
    const c = cliente(existente.clienteId);
    if (!confirm(`La placa ${placa} ya está registrada a nombre de ${c?.nombre || 'otro cliente'} (${existente.marca} ${existente.modelo}).\n¿Usar ese vehículo de todas formas?`)) return null;
    return existente.id;
  }
  const v = { id: uid(), clienteId, marca: d.marca, modelo: d.modelo, placa, anio: d.anio || '', color: d.color || '', creado: new Date().toISOString() };
  db.vehiculos.push(v);
  return v.id;
}

function etiquetaVehiculo(v) {
  const extra = [v.anio, v.color].filter(Boolean).join(' · ');
  return `${v.marca} ${v.modelo}${extra ? ' (' + extra + ')' : ''}`;
}

// ===================== CAMPOS DE ACEITE =====================
const aceitePorId = (id) => id && db.aceites.find((a) => a.id === id);

function resumenAceite(s) {
  if (!s) return '';
  if (!s.aceiteMarca && !s.aceiteViscosidad) return s.aceite || '';
  return [s.aceiteMarca, s.aceiteLinea, s.aceiteViscosidad].filter(Boolean).join(' ') + (s.aceiteTipo ? ' · ' + s.aceiteTipo : '');
}

function fotoAceiteHTML(s, clase = 'aceite-thumb') {
  const a = aceitePorId(s?.aceiteId || s?.id);
  const src = a && srcFoto(a);
  return src ? `<img class="${clase}" src="${esc(src)}" alt="${esc(a.marca + ' ' + a.linea)}">` : '';
}

function camposAceiteHTML() {
  return `<div class="grid">
    <label>Marca *<select name="aceiteMarcaSel">${MARCAS_ACEITE.map((m) => `<option>${m}</option>`).join('')}<option value="__otra">Otra marca…</option></select></label>
    <label class="campo-otra" hidden>Escribe la marca *<input name="aceiteMarcaOtra" list="lista-marcas-aceite"></label>
    <label>Producto / línea <span class="opt">(opcional)</span><select name="aceiteId"></select></label>
    <label>Viscosidad *<input name="viscosidad" required list="lista-viscosidades" placeholder="Ej: 10W-40" class="upper"></label>
    <label>Tipo *<select name="aceiteTipo" required><option value="">Selecciona…</option>${TIPOS_ACEITE.map((t) => `<option>${t}</option>`).join('')}</select></label>
  </div>
  <div class="aceite-foto" hidden></div>`;
}

// Prepara un contenedor con camposAceiteHTML(); devuelve { set(servicio), refrescar(), leer() }.
function prepararAceite(cont) {
  cont.innerHTML = camposAceiteHTML();
  const q = (n) => cont.querySelector(`[name="${n}"]`);
  const marcaActual = () => (q('aceiteMarcaSel').value === '__otra' ? q('aceiteMarcaOtra').value.trim() : q('aceiteMarcaSel').value);
  const pintarFoto = () => {
    const a = aceitePorId(q('aceiteId').value); const box = cont.querySelector('.aceite-foto');
    box.hidden = !a;
    if (a) box.innerHTML = (srcFoto(a) ? `<img class="aceite-thumb grande" src="${esc(srcFoto(a))}" alt="">` : '<span class="sin-foto">Sin foto</span>') +
      `<div><strong>${esc(a.marca)} ${esc(a.linea)} ${esc(a.viscosidad)}</strong><br><small>${esc(a.tipo)}</small></div>`;
  };
  const pintarProductos = (selId = q('aceiteId').value) => {
    const marca = norm(marcaActual());
    const prods = db.aceites.filter((a) => marca && norm(a.marca) === marca)
      .sort((a, b) => (a.linea + a.viscosidad).localeCompare(b.linea + b.viscosidad));
    q('aceiteId').innerHTML = `<option value="">${prods.length ? '— Otro / sin especificar —' : '— Sin productos de esta marca —'}</option>` +
      prods.map((a) => `<option value="${a.id}" ${a.id === selId ? 'selected' : ''}>${esc(a.linea)} ${esc(a.viscosidad)}</option>`).join('');
    pintarFoto();
  };
  const toggleOtra = () => {
    const otra = q('aceiteMarcaSel').value === '__otra';
    cont.querySelector('.campo-otra').hidden = !otra; q('aceiteMarcaOtra').required = otra;
  };
  q('aceiteMarcaSel').onchange = () => { toggleOtra(); pintarProductos(''); };
  q('aceiteMarcaOtra').oninput = () => pintarProductos('');
  q('aceiteId').onchange = () => {
    const a = aceitePorId(q('aceiteId').value);
    if (a) { q('viscosidad').value = a.viscosidad; q('aceiteTipo').value = a.tipo; }
    pintarFoto();
  };
  return {
    set(s) {
      const marca = s?.aceiteMarca || MARCAS_ACEITE[0];
      const conocida = MARCAS_ACEITE.find((m) => norm(m) === norm(marca));
      q('aceiteMarcaSel').value = conocida || '__otra';
      q('aceiteMarcaOtra').value = conocida ? '' : marca;
      toggleOtra();
      pintarProductos(s?.aceiteId || '');
      q('viscosidad').value = s?.aceiteViscosidad || '';
      q('aceiteTipo').value = s?.aceiteTipo || '';
    },
    refrescar() { pintarProductos(); },
    leer() {
      const a = aceitePorId(q('aceiteId').value);
      const r = { aceiteId: a ? a.id : '', aceiteMarca: marcaActual(), aceiteLinea: a ? a.linea : '', aceiteViscosidad: q('viscosidad').value.trim().toUpperCase(), aceiteTipo: q('aceiteTipo').value };
      r.aceite = resumenAceite(r);
      return r;
    },
  };
}

// ===================== CATÁLOGO DE ACEITES =====================
function renderCatalogo() {
  const lista = [...db.aceites].sort((a, b) => (a.marca + a.linea + a.viscosidad).localeCompare(b.marca + b.linea + b.viscosidad));
  $('#catalogo-aceites').innerHTML = lista.map((a) => `
    <div class="producto" data-aid="${a.id}">
      ${srcFoto(a) ? `<img src="${esc(srcFoto(a))}" alt="">` : '<div class="sin-foto">📷<br>Agregar foto</div>'}
      <strong>${esc(a.marca)} ${esc(a.linea)}</strong>
      <small>${esc(a.viscosidad)} · ${esc(a.tipo)}</small>
    </div>`).join('') || '<p class="vacio">El catálogo está vacío.</p>';
}

function redimensionarImagen(file, max = 500) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rej(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

function formAceite(a = null) {
  const nuevo = !a;
  let foto = a?.foto || (a && fotoPredeterminada(a)) || '';
  abrirModal(`
    <h3>${nuevo ? 'Agregar aceite al catálogo' : 'Editar aceite'}</h3>
    <form id="form-aceite">
      <div class="aceite-editor">
        <div class="foto-box" id="foto-box">
          <div id="foto-preview"></div>
          <button type="button" class="btn small primary" id="foto-buscar" style="justify-content:center">🔍 Buscar en Google</button>
          <label class="btn small ghost" style="justify-content:center">Elegir archivo
            <input id="foto-input" type="file" accept="image/*" hidden>
          </label>
          <button type="button" class="btn tiny ghost" id="foto-quitar">Quitar foto</button>
        </div>
        <div class="grid" style="flex:1">
          <label>Marca *<input name="marca" required list="lista-marcas-aceite" value="${esc(a?.marca || MARCAS_ACEITE[0])}"></label>
          <label>Línea / producto *<input name="linea" required placeholder="Ej: 8100 X-clean" value="${esc(a?.linea || '')}"></label>
          <label>Viscosidad *<input name="viscosidad" required class="upper" list="lista-viscosidades" value="${esc(a?.viscosidad || '')}"></label>
          <label>Tipo *<select name="tipo" required>${TIPOS_ACEITE.map((t) => `<option ${t === a?.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
      </div>
      <p class="hint pasos-foto"><strong>Para agregar la foto:</strong> 1) pulsa <em>Buscar en Google</em>, 2) en la imagen que te guste haz clic derecho → <em>Copiar imagen</em>, 3) vuelve aquí y pulsa <strong>Ctrl + V</strong>. También puedes arrastrar la imagen a esta ventana.</p>
      <div class="actions" style="margin-top:12px">
        ${nuevo ? '' : '<button type="button" class="btn danger" id="borrar-aceite" style="margin-right:auto">Eliminar</button>'}
        <button type="button" class="btn ghost" data-act="cerrar">Cancelar</button>
        <button class="btn primary">Guardar</button>
      </div>
    </form>`);
  const pintar = () => {
    $('#foto-preview').innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : '<div class="sin-foto">Sin foto</div>';
    $('#foto-quitar').hidden = !foto;
  };
  pintar();
  const usarArchivo = async (f) => {
    if (!f || !f.type.startsWith('image/')) return false;
    try { foto = await redimensionarImagen(f); pintar(); toast('Foto agregada'); } catch (err) { alert(err.message); }
    return true;
  };
  $('#foto-input').onchange = (e) => usarArchivo(e.target.files[0]);
  $('#foto-buscar').onclick = () => {
    const fa = $('#form-aceite');
    const q = [fa.marca.value, fa.linea.value, fa.viscosidad.value].map((x) => x.trim()).filter(Boolean).join(' ');
    if (!q) { alert('Escribe primero la marca y la línea del aceite.'); return; }
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q + ' aceite 1L'), '_blank', 'noopener');
  };
  // Pegar (Ctrl+V) o arrastrar una imagen mientras la ventana está abierta.
  const alPegar = async (e) => {
    if (!$('#form-aceite')) { document.removeEventListener('paste', alPegar); return; }
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); usarArchivo(item.getAsFile()); }
  };
  document.addEventListener('paste', alPegar);
  $('#modal').addEventListener('close', () => document.removeEventListener('paste', alPegar), { once: true });
  const zona = $('#modal-body');
  zona.ondragover = (e) => { e.preventDefault(); $('#foto-box').classList.add('soltar'); };
  zona.ondragleave = () => $('#foto-box').classList.remove('soltar');
  zona.ondrop = async (e) => {
    e.preventDefault(); $('#foto-box').classList.remove('soltar');
    if (await usarArchivo(e.dataTransfer.files[0])) return;
    alert('No se pudo usar esa imagen arrastrada. Prueba con clic derecho → "Copiar imagen" y luego Ctrl + V.');
  };
  $('#foto-quitar').onclick = () => { foto = ''; pintar(); };
  $('#form-aceite').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const datos = { marca: d.marca.trim(), linea: d.linea.trim(), viscosidad: d.viscosidad.trim().toUpperCase(), tipo: d.tipo, foto };
    if (nuevo) db.aceites.push({ id: uid(), ...datos }); else Object.assign(a, datos);
    await guardar(); cerrarModal(); toast('Catálogo actualizado');
  };
  const b = $('#borrar-aceite');
  if (b) b.onclick = async () => {
    if (!confirm(`¿Eliminar ${a.marca} ${a.linea} ${a.viscosidad} del catálogo? Los registros ya guardados conservan su información.`)) return;
    db.aceites = db.aceites.filter((x) => x.id !== a.id);
    await guardar(); cerrarModal();
  };
}

// ===================== NUEVO REGISTRO =====================
let aceiteNuevo = null; // campos de aceite del formulario principal
let sel = { clienteId: null, vehiculoId: null };
const form = () => $('#form-nuevo');

function limpiarFormulario() {
  sel = { clienteId: null, vehiculoId: null };
  form().reset();
  form().fecha.value = hoyISO();
  aceiteNuevo.set(null);
  $('#seleccion-actual').hidden = true;
  $('#btn-otro-vehiculo').hidden = true;
  $('#titulo-form').textContent = 'Nuevo cliente';
  $('#buscar-nuevo').value = '';
  $('#resultados-nuevo').innerHTML = '';
}

function seleccionarVehiculo(vid) {
  const v = vehiculo(vid); const c = cliente(v.clienteId);
  sel = { clienteId: c.id, vehiculoId: v.id };
  const f = form();
  f.nombre.value = c.nombre; f.telefono.value = c.telefono;
  f.marca.value = v.marca; f.modelo.value = v.modelo; f.placa.value = v.placa;
  f.anio.value = v.anio || ''; f.color.value = v.color || '';
  f.fecha.value = hoyISO();
  f.km.value = ''; f.proximoKm.value = ''; f.revisiones.value = '';
  const u = ultimoServicio(v.id);
  aceiteNuevo.set(u); f.filtro.value = u?.filtro || ''; f.sku.value = u?.sku || '';
  $('#titulo-form').textContent = 'Nuevo cambio de aceite';
  $('#btn-otro-vehiculo').hidden = false;
  const box = $('#seleccion-actual');
  box.hidden = false;
  box.innerHTML = `<strong>${esc(c.nombre)}</strong> · ${esc(etiquetaVehiculo(v))} · <strong>${esc(v.placa)}</strong><br>` +
    (u ? `Último cambio: ${fmtFecha(u.fecha)} a ${fmtKm(u.km)} · Próximo: ${fmtKm(u.proximoKm)} · ${esc(resumenAceite(u))}` : 'Sin cambios anteriores');
  $('#resultados-nuevo').innerHTML = '';
  $('#buscar-nuevo').value = '';
  f.km.focus();
}

function otroVehiculo() {
  const f = form();
  sel.vehiculoId = null;
  ['marca', 'modelo', 'placa', 'anio', 'color', 'km', 'proximoKm', 'filtro', 'sku', 'revisiones'].forEach((n) => (f[n].value = ''));
  aceiteNuevo.set(null);
  $('#titulo-form').textContent = 'Nuevo vehículo para ' + f.nombre.value;
  $('#seleccion-actual').innerHTML = `<strong>${esc(f.nombre.value)}</strong> · nuevo vehículo`;
  f.marca.focus();
}

function renderResultadosNuevo() {
  const q = $('#buscar-nuevo').value;
  const lista = buscarVehiculos(q).slice(0, 8);
  const cont = $('#resultados-nuevo');
  if (!q.trim()) { cont.innerHTML = ''; return; }
  if (!lista.length) { cont.innerHTML = '<p class="hint">No se encontró. Completa el formulario para registrarlo como nuevo.</p>'; return; }
  cont.innerHTML = lista.map((v) => {
    const c = cliente(v.clienteId); const u = ultimoServicio(v.id);
    return `<div class="resultado" data-vid="${v.id}">
      <div><strong>${esc(c.nombre)}</strong> <small>${esc(c.telefono)}</small><br>${esc(etiquetaVehiculo(v))}</div>
      <div style="text-align:right"><strong>${esc(v.placa)}</strong><br><small>${u ? 'Último: ' + fmtFecha(u.fecha) : 'Sin servicios'}</small></div>
    </div>`;
  }).join('');
}

async function guardarNuevo(e) {
  e.preventDefault();
  const f = form();
  const d = Object.fromEntries(new FormData(f).entries());
  for (const k of Object.keys(d)) d[k] = d[k].trim();
  d.placa = d.placa.toUpperCase().replace(/\s+/g, '');
  d.sku = d.sku.toUpperCase();

  if (soloDigitos(d.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos (ej. 0414-1234567).'); return; }
  d.km = parseKm(d.km); d.proximoKm = parseKm(d.proximoKm);
  if (!Number.isFinite(d.km) || !Number.isFinite(d.proximoKm)) { alert('Revisa el KM actual y el próximo KM.'); return; }
  if (d.proximoKm <= d.km) { if (!confirm('El próximo KM es menor o igual al KM actual. ¿Guardar de todas formas?')) return; }

  // Si se escribió a mano una placa que ya existe, usar ese vehículo.
  if (!sel.vehiculoId) {
    const existente = db.vehiculos.find((v) => v.placa === d.placa);
    if (existente) {
      const c = cliente(existente.clienteId);
      if (!confirm(`La placa ${d.placa} ya está registrada (${existente.marca} ${existente.modelo} de ${c.nombre}).\n¿Agregar este cambio de aceite a ese vehículo?`)) return;
      sel.vehiculoId = existente.id; sel.clienteId = existente.clienteId;
    }
  }
  // Si es cliente nuevo pero el teléfono ya existe, reutilizarlo.
  if (!sel.clienteId) {
    const tel = telWhatsApp(d.telefono);
    const existente = db.clientes.find((c) => telWhatsApp(c.telefono) === tel);
    if (existente && confirm(`Ya existe un cliente con ese teléfono: ${existente.nombre}.\n¿Asignarle este vehículo?`)) sel.clienteId = existente.id;
  }

  const ahora = new Date().toISOString();
  let c = sel.clienteId && cliente(sel.clienteId);
  if (c) { c.nombre = d.nombre; c.telefono = d.telefono; }
  else { c = { id: uid(), nombre: d.nombre, telefono: d.telefono, creado: ahora }; db.clientes.push(c); }

  let v = sel.vehiculoId && vehiculo(sel.vehiculoId);
  const datosV = { clienteId: c.id, marca: d.marca, modelo: d.modelo, placa: d.placa, anio: d.anio, color: d.color };
  if (v) Object.assign(v, datosV);
  else { v = { id: uid(), ...datosV, creado: ahora }; db.vehiculos.push(v); }

  db.servicios.push({
    id: uid(), vehiculoId: v.id, tipo: 'aceite', fecha: d.fecha,
    km: d.km, proximoKm: d.proximoKm,
    ...aceiteNuevo.leer(), filtro: d.filtro, sku: d.sku, revisiones: d.revisiones,
    recordatorioEnviado: null, creado: ahora,
  });

  await guardar();
  toast(`Registro guardado: ${c.nombre} · ${v.placa}`);
  limpiarFormulario();
}

function renderListas() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  const fill = (id, vals) => ($(id).innerHTML = vals.map((x) => `<option value="${esc(x)}">`).join(''));
  fill('#lista-marcas', uniq(db.vehiculos.map((v) => v.marca)));
  fill('#lista-viscosidades', uniq([...VISCOSIDADES, ...db.aceites.map((a) => a.viscosidad), ...db.servicios.map((s) => s.aceiteViscosidad)]));
  fill('#lista-marcas-aceite', uniq([...MARCAS_ACEITE, ...db.aceites.map((a) => a.marca), ...db.servicios.map((s) => s.aceiteMarca)]));
  fill('#lista-filtros', uniq(db.servicios.map((s) => s.filtro)));
  fill('#lista-skus', uniq(db.servicios.map((s) => s.sku)));
}

// ===================== REGISTROS =====================
function renderRegistros() {
  const q = $('#buscar-registros').value;
  const filtro = $('#filtro-estado').value;
  let lista = q.trim() ? buscarVehiculos(q) : [...db.vehiculos];
  const filas = lista.map((v) => ({ v, c: cliente(v.clienteId), u: ultimoServicio(v.id), e: estadoVehiculo(v.id) }))
    .filter((x) => !filtro || x.e.clave === filtro)
    .sort((a, b) => (b.u?.fecha || '').localeCompare(a.u?.fecha || ''));
  $('#tabla-registros').innerHTML = filas.map(({ v, c, u, e }) => `
    <tr data-vid="${v.id}">
      <td><strong>${esc(c.nombre)}</strong></td>
      <td>${esc(c.telefono)}</td>
      <td>${esc(v.marca)} ${esc(v.modelo)}</td>
      <td>${esc(v.placa)}</td>
      <td>${fmtFecha(u?.fecha)}</td>
      <td>${fmtKm(u?.km)}</td>
      <td>${fmtKm(u?.proximoKm)}</td>
      <td><div class="celda-aceite">${fotoAceiteHTML(u, 'aceite-mini')}<span>${esc(u ? [u.aceiteLinea || u.aceiteMarca, u.aceiteViscosidad].filter(Boolean).join(' ') || u.aceite : '—')}</span></div></td>
      <td><span class="estado ${e.clave}">${esc(e.texto)}</span></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-act="ver" data-vid="${v.id}" title="Ver y modificar">✏️</button>
        <button class="btn tiny ghost" data-act="pdf-servicios" data-vid="${v.id}" title="PDF del historial">PDF</button>
        <button class="btn tiny wa" data-act="mensaje" data-vid="${v.id}">Mensaje</button>
      </td>
    </tr>`).join('');
  $('#vacio-registros').hidden = filas.length > 0;
  $('#vacio-registros').textContent = db.vehiculos.length ? 'Ningún registro coincide con la búsqueda.' : 'No hay registros todavía.';
}

function abrirModal(html) { $('#modal-body').innerHTML = html; const m = $('#modal'); if (!m.open) m.showModal(); }
function cerrarModal() { $('#modal').close(); }

function verDetalle(vid) {
  const v = vehiculo(vid); const c = cliente(v.clienteId); const e = estadoVehiculo(vid);
  const otros = db.vehiculos.filter((x) => x.clienteId === c.id && x.id !== v.id);
  const hist = serviciosDe(vid);
  abrirModal(`
    <div class="form-head"><h3>${esc(c.nombre)}</h3><button class="btn small ghost" data-act="cerrar">Cerrar</button></div>
    <div class="detalle-grid">
      <div><small>Teléfono</small>${esc(c.telefono)}</div>
      <div><small>Vehículo</small>${esc(v.marca)} ${esc(v.modelo)}</div>
      <div><small>Placa</small>${esc(v.placa)}</div>
      <div><small>Año</small>${esc(v.anio || '—')}</div>
      <div><small>Color</small>${esc(v.color || '—')}</div>
      <div><small>Estado</small><span class="estado ${e.clave}">${esc(e.texto)}</span>${e.vence ? ' <small>recordar el ' + fmtFecha(e.vence) + '</small>' : ''}</div>
    </div>
    ${otros.length ? `<p class="hint">Otros vehículos: ${otros.map((o) => `<a href="#" data-act="ver" data-vid="${o.id}">${esc(o.marca)} ${esc(o.modelo)} (${esc(o.placa)})</a>`).join(', ')}</p>` : ''}
    <div class="actions" style="justify-content:flex-start;margin-bottom:12px">
      <button class="btn small primary" data-act="nuevo-cambio" data-vid="${v.id}">+ Nuevo cambio de aceite</button>
      <button class="btn small ghost" data-act="agendar" data-vid="${v.id}">Agendar cita</button>
      <button class="btn small wa" data-act="mensaje" data-vid="${v.id}">Enviar mensaje</button>
      <button class="btn small ghost" data-act="pdf-servicios" data-vid="${v.id}">⬇ PDF</button>
      <button class="btn small ghost" data-act="editar-cv" data-vid="${v.id}">Editar cliente / vehículo</button>
    </div>
    <div class="historial">
      <h4>Historial de cambios de aceite (${hist.length})</h4>
      ${hist.map((s) => `
        <div class="servicio">
          <div class="top"><strong>${fmtFecha(s.fecha)} · ${fmtKm(s.km)}</strong>
            <span><button class="btn tiny ghost" data-act="editar-s" data-sid="${s.id}">Editar</button>
            <button class="btn tiny danger" data-act="borrar-s" data-sid="${s.id}">Borrar</button></span></div>
          <div class="servicio-aceite">${fotoAceiteHTML(s)}<div>
          Próximo: ${fmtKm(s.proximoKm)} · Aceite: <strong>${esc(resumenAceite(s))}</strong>${s.filtro || s.sku ? ` · Filtro: ${esc(s.filtro)} ${s.sku ? '(SKU ' + esc(s.sku) + ')' : ''}` : ''}
          ${s.revisiones ? `<br><small>Revisiones: ${esc(s.revisiones)}</small>` : ''}
          ${s.recordatorioEnviado ? `<br><small>Recordatorio enviado el ${fmtFecha(s.recordatorioEnviado)}</small>` : ''}
          </div></div>
        </div>`).join('') || '<p class="hint">Sin servicios.</p>'}
    </div>
    ${(() => {
      // Solo los mensajes relacionados con cambios de aceite (esta pestaña es exclusiva de servicios)
      const msgs = (db.mensajes || []).filter((m) => m.vehiculoId === v.id && ['recordatorio', 'libre', 'prueba'].includes(m.tipo)).sort((a, b) => b.creado.localeCompare(a.creado));
      return msgs.length ? `<div class="historial"><h4>Mensajes enviados (${msgs.length})</h4>${msgs.slice(0, 10).map((m) => `
        <div class="servicio"><strong>${fmtFecha(m.fecha)} · ${esc(PLANTILLAS[m.tipo]?.nombre || ({ presupuesto: 'Presupuesto', cita: 'Recordatorio de cita', revision: 'Diagnóstico de revisión' }[m.tipo] || m.tipo))}</strong><br><small>${esc(m.texto)}</small></div>`).join('')}</div>` : '';
    })()}
    <div class="actions" style="justify-content:flex-start;border-top:1px solid var(--line);padding-top:12px">
      <button class="btn tiny danger" data-act="borrar-v" data-vid="${v.id}">Eliminar vehículo y su historial</button>
    </div>`);
}

// PDF con el historial de cambios de aceite de un vehículo
function pdfServicios(vid) {
  const v = vehiculo(vid); if (!v) return;
  const c = cliente(v.clienteId) || {};
  const hist = serviciosDe(vid);
  const html = `<div class="doc doc-print">
    <div class="doc-head">
      <img class="doc-logo" src="img/logo.png" alt="Jacks">
      <div class="doc-empresa"><div class="doc-nombre">${EMPRESA.nombre}</div><div>${EMPRESA.direccion}</div><div>Telf: ${EMPRESA.telefono}</div><div>R.I.F: ${EMPRESA.rif}</div></div>
    </div>
    <div class="doc-numero">HISTORIAL DE CAMBIOS DE ACEITE</div>
    <div class="doc-box">
      <div class="doc-fila2"><div>CLIENTE: ${esc(c.nombre)}</div><div class="r">FECHA: ${fmtFecha(hoyISO())}</div></div>
      <div class="doc-fila2"><div>TELÉFONO: ${esc(c.telefono)}</div><div class="r">VEHÍCULO: ${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.placa)}</div></div>
    </div>
    <table class="doc-items">
      <thead><tr><th>FECHA</th><th>KM</th><th>PRÓXIMO KM</th><th>ACEITE</th><th>FILTRO</th></tr></thead>
      <tbody>${hist.map((s) => `<tr><td>${fmtFecha(s.fecha)}</td><td>${fmtKm(s.km)}</td><td>${fmtKm(s.proximoKm)}</td>
        <td>${esc(resumenAceite(s))}</td><td>${esc([s.filtro, s.sku && 'SKU ' + s.sku].filter(Boolean).join(' · '))}</td></tr>
        ${s.revisiones ? `<tr><td></td><td colspan="4"><small>Revisiones: ${esc(s.revisiones)}</small></td></tr>` : ''}`).join('')}</tbody>
    </table>
  </div>`;
  imprimirDocumento(html, `Servicios ${v.placa} - ${c.nombre || ''}`);
}

function editarClienteVehiculo(vid) {
  const v = vehiculo(vid); const c = cliente(v.clienteId);
  abrirModal(`
    <h3>Editar cliente y vehículo</h3>
    <form id="form-editar-cv">
      <fieldset><legend>Cliente</legend><div class="grid">
        <label>Nombre<input name="nombre" required value="${esc(c.nombre)}"></label>
        <label>Teléfono<input name="telefono" required value="${esc(c.telefono)}"></label>
      </div></fieldset>
      <fieldset><legend>Vehículo</legend><div class="grid">
        <label>Marca<input name="marca" required value="${esc(v.marca)}"></label>
        <label>Modelo<input name="modelo" required value="${esc(v.modelo)}"></label>
        <label>Placa<input name="placa" required class="upper" value="${esc(v.placa)}"></label>
        <label>Año<input name="anio" value="${esc(v.anio || '')}"></label>
        <label>Color<input name="color" value="${esc(v.color || '')}"></label>
      </div></fieldset>
      <div class="actions"><button type="button" class="btn ghost" data-act="ver" data-vid="${v.id}">Cancelar</button><button class="btn primary">Guardar</button></div>
    </form>`);
  $('#form-editar-cv').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const placa = d.placa.trim().toUpperCase().replace(/\s+/g, '');
    if (db.vehiculos.some((x) => x.placa === placa && x.id !== v.id)) { alert('Esa placa ya pertenece a otro vehículo.'); return; }
    Object.assign(c, { nombre: d.nombre.trim(), telefono: d.telefono.trim() });
    Object.assign(v, { marca: d.marca.trim(), modelo: d.modelo.trim(), placa, anio: d.anio.trim(), color: d.color.trim() });
    await guardar(); toast('Datos actualizados'); verDetalle(v.id);
  };
}

function editarServicio(sid) {
  const s = db.servicios.find((x) => x.id === sid);
  abrirModal(`
    <h3>Editar cambio de aceite</h3>
    <form id="form-editar-s"><div class="grid">
      <label>Fecha<input name="fecha" type="date" required value="${s.fecha}"></label>
      <label>KM<input name="km" class="km" inputmode="numeric" required value="${fmtNum(s.km)}"></label>
      <label>Próximo KM<input name="proximoKm" class="km" inputmode="numeric" required value="${fmtNum(s.proximoKm)}"></label>
      <label>Filtro<input name="filtro" list="lista-filtros" value="${esc(s.filtro)}"></label>
      <label>SKU del filtro<input name="sku" class="upper" value="${esc(s.sku)}"></label>
    </div>
    <h4 class="subtitulo">Aceite</h4>
    ${s.aceite && !s.aceiteMarca ? `<p class="hint">Dato anterior: ${esc(s.aceite)}</p>` : ''}
    <div id="aceite-editar"></div>
    <label class="full">Revisiones adicionales<textarea name="revisiones" rows="3">${esc(s.revisiones)}</textarea></label>
    <div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" data-act="ver" data-vid="${s.vehiculoId}">Cancelar</button><button class="btn primary">Guardar</button></div>
    </form>`);
  const aceiteEd = prepararAceite($('#aceite-editar'));
  aceiteEd.set(s);
  $('#form-editar-s').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const km = parseKm(d.km), proximoKm = parseKm(d.proximoKm);
    if (!Number.isFinite(km) || !Number.isFinite(proximoKm)) { alert('Revisa el KM y el próximo KM.'); return; }
    Object.assign(s, { fecha: d.fecha, km, proximoKm, ...aceiteEd.leer(), filtro: d.filtro.trim(), sku: d.sku.trim().toUpperCase(), revisiones: d.revisiones.trim() });
    await guardar(); toast('Servicio actualizado'); verDetalle(s.vehiculoId);
  };
}

// ===================== RECORDATORIOS =====================
function candidatosRecordatorio() {
  return db.vehiculos.map((v) => ({ v, c: cliente(v.clienteId), s: ultimoServicio(v.id), e: estadoVehiculo(v.id) }))
    .filter((x) => x.s && x.c);
}

function tarjetaRecordatorio({ v, c, s, e }, modo) {
  const msg = mensajeRecordatorio(c, v, s);
  let acciones = '';
  if (modo === 'pendiente') {
    acciones = `<button class="btn small wa" data-act="enviar" data-sid="${s.id}">Enviar por WhatsApp</button>
      <button class="btn small ghost" data-act="marcar" data-sid="${s.id}">Marcar como enviado</button>
      <button class="btn small ghost" data-act="agendar" data-vid="${v.id}">Agendar cita</button>`;
  } else if (modo === 'proximo') {
    acciones = `<button class="btn small ghost" data-act="mensaje" data-vid="${v.id}">Enviar ahora</button>`;
  } else if (modo === 'enviado') {
    acciones = `<button class="btn small ghost" data-act="agendar" data-vid="${v.id}">Agendar cita</button>
      <button class="btn small ghost" data-act="reenviar" data-sid="${s.id}">Reenviar</button>
      <button class="btn small ghost" data-act="desmarcar" data-sid="${s.id}">Deshacer envío</button>`;
  }
  const info = modo === 'pendiente' ? `<span class="estado vencido">Desde ${fmtFecha(e.vence)}</span>`
    : modo === 'proximo' ? `<span class="estado pronto">${fmtFecha(e.vence)} (en ${e.dias} d)</span>`
      : `<span class="estado aldia">Enviado ${fmtFecha(s.recordatorioEnviado)}</span>`;
  return `<div class="recordatorio">
    <div class="top"><div><strong>${esc(c.nombre)}</strong> · ${esc(c.telefono)} · ${esc(v.marca)} ${esc(v.modelo)} · <strong>${esc(v.placa)}</strong></div>${info}</div>
    ${modo === 'pendiente' ? `<div class="mensaje">${esc(msg)}</div>` : `<small class="hint">Último cambio: ${fmtFecha(s.fecha)} a ${fmtKm(s.km)}</small>`}
    ${acciones ? `<div class="actions" style="margin-top:8px">${acciones}</div>` : ''}
  </div>`;
}

function renderRecordatorios() {
  const todos = candidatosRecordatorio();
  const pendientes = todos.filter((x) => x.e.clave === 'vencido' && !x.s.recordatorioEnviado).sort((a, b) => a.e.vence.localeCompare(b.e.vence));
  const proximos = todos.filter((x) => x.e.clave !== 'vencido' && x.e.dias <= 30).sort((a, b) => a.e.dias - b.e.dias);
  const enviados = todos.filter((x) => x.s.recordatorioEnviado).sort((a, b) => b.s.recordatorioEnviado.localeCompare(a.s.recordatorioEnviado)).slice(0, 20);
  $('#lista-pendientes').innerHTML = pendientes.map((x) => tarjetaRecordatorio(x, 'pendiente')).join('') || '<p class="vacio">No hay recordatorios pendientes hoy. 👍</p>';
  $('#lista-proximos').innerHTML = proximos.map((x) => tarjetaRecordatorio(x, 'proximo')).join('') || '<p class="vacio">Nada en los próximos 30 días.</p>';
  $('#lista-enviados').innerHTML = enviados.map((x) => tarjetaRecordatorio(x, 'enviado')).join('') || '<p class="vacio">Aún no se han enviado recordatorios.</p>';
  // Seguimiento de reparaciones a los 6 meses
  const reps = candidatosReparacion().filter((x) => !x.enviado && x.vence <= hoyISO()).sort((a, b) => a.vence.localeCompare(b.vence));
  $('#lista-reparaciones-rec').innerHTML = reps.map(tarjetaRecReparacion).join('') || '<p class="vacio">No hay seguimientos de reparaciones pendientes.</p>';
  const total = pendientes.length + reps.length;
  const b = $('#badge-recordatorios'); b.textContent = total; b.hidden = !total;
}

// ---------- Recordatorio de seguimiento 6 meses después de la última reparación ----------
// Se registra en "mensajes" (no en la reparación, que puede estar cerrada y bloqueada).
function candidatosReparacion() {
  const ultimas = {};
  (db.reparaciones || []).filter((r) => r.estado === 'culminado' && r.fechaCierre).forEach((r) => {
    const k = r.vehiculoId || r.id;
    if (!ultimas[k] || r.fechaCierre > ultimas[k].fechaCierre) ultimas[k] = r;
  });
  return Object.values(ultimas).map((r) => ({
    r, vence: sumarMeses(r.fechaCierre, 6),
    enviado: (db.mensajes || []).find((m) => m.tipo === 'recordatorio-reparacion' && m.reparacionId === r.id),
  }));
}
function datosContactoRep(r) {
  const v = r.vehiculoId && vehiculo(r.vehiculoId); const c = v && cliente(v.clienteId);
  return { nombre: c?.nombre || r.cliente, telefono: c?.telefono || r.telefono, vehiculo: v ? `${v.marca} ${v.modelo}` : (r.vehiculo || '').split(' · ')[0], placa: v?.placa || (r.vehiculo || '').split(' · ')[1] || '' };
}
function mensajeRecReparacion(r) {
  const d = datosContactoRep(r);
  return rellenarMensaje('reparacion', { nombre: d.nombre, vehiculo: d.vehiculo, placa: d.placa, fecha: fmtFecha(r.fechaCierre) });
}
function tarjetaRecReparacion({ r, vence }) {
  const d = datosContactoRep(r);
  return `<div class="recordatorio">
    <div class="top"><div><strong>${esc(d.nombre)}</strong> · ${esc(d.telefono)} · ${esc(d.vehiculo)} · <strong>${esc(d.placa)}</strong></div>
      <span class="estado vencido">Desde ${fmtFecha(vence)}</span></div>
    <small class="hint">Reparación ${typeof numRep === 'function' ? numRep(r.numero) : ''} culminada el ${fmtFecha(r.fechaCierre)}</small>
    <div class="mensaje">${esc(mensajeRecReparacion(r))}</div>
    <div class="actions" style="margin-top:8px">
      <button class="btn small wa" data-act="enviar-rep" data-repid="${r.id}">Enviar por WhatsApp</button>
      <button class="btn small ghost" data-act="marcar-rep" data-repid="${r.id}">Marcar como enviado</button>
    </div>
  </div>`;
}
async function registrarRecReparacion(r, abrir) {
  const d = datosContactoRep(r);
  if (abrir) {
    if (soloDigitos(d.telefono).length < 10) { alert('Este cliente no tiene un teléfono válido registrado.'); return; }
    abrirWhatsApp(d.telefono, mensajeRecReparacion(r));
  }
  db.mensajes.push({ id: uid(), vehiculoId: r.vehiculoId || null, reparacionId: r.id, telefono: d.telefono, tipo: 'recordatorio-reparacion', texto: `Seguimiento 6 meses · reparación ${typeof numRep === 'function' ? numRep(r.numero) : ''}`, fecha: hoyISO(), creado: new Date().toISOString() });
  await guardar();
}

async function marcarEnviado(sid, valor) {
  const s = db.servicios.find((x) => x.id === sid);
  s.recordatorioEnviado = valor ? hoyISO() : null;
  await guardar();
}

// ===================== ENVÍO MANUAL DE MENSAJES =====================
function formMensaje(preVid = null, preTipo = null) {
  let vidSel = preVid;
  const tipoInicial = preTipo || (preVid && ultimoServicio(preVid) ? 'recordatorio' : 'libre');
  abrirModal(`
    <div class="form-head"><h3>Enviar mensaje por WhatsApp</h3><button class="btn small ghost" data-act="cerrar">Cerrar</button></div>
    <form id="form-mensaje">
      <fieldset><legend>Destinatario</legend>
        <div id="msg-veh" class="seleccion" style="margin:0 0 8px"></div>
        <input id="msg-buscar" type="search" placeholder="Buscar cliente por nombre, teléfono o placa…">
        <div id="msg-res" class="picker-list"></div>
        <div class="grid" style="margin-top:8px">
          <label>Teléfono<input name="telefono" required placeholder="0414-1234567"></label>
          <label>Plantilla<select name="tipo">${Object.entries(PLANTILLAS).map(([k, p]) => `<option value="${k}" ${k === tipoInicial ? 'selected' : ''}>${p.nombre}</option>`).join('')}</select></label>
        </div>
      </fieldset>
      <label>Mensaje (puedes editarlo)<textarea name="texto" rows="7" required></textarea></label>
      <label id="msg-marcar-wrap" style="margin-top:8px;font-weight:400" hidden><input type="checkbox" name="marcar" checked style="width:auto;margin-right:6px">Marcar el recordatorio de aceite como enviado</label>
      <p class="hint" style="margin-top:8px">Se abrirá WhatsApp con el mensaje listo; solo tienes que presionar enviar. Puedes poner tu propio número para hacer una prueba (si es de otro país, escríbelo con <strong>+</strong> y su código, ej. +1 305 555 1234).</p>
      <div class="actions"><button type="button" class="btn ghost" data-act="cerrar">Cancelar</button><button class="btn wa">Abrir en WhatsApp</button></div>
    </form>`);
  const f = $('#form-mensaje');
  const datos = () => {
    const v = vidSel && vehiculo(vidSel);
    return v ? { v, c: cliente(v.clienteId), s: ultimoServicio(v.id) } : { v: null, c: { nombre: '' }, s: null };
  };
  const aplicarPlantilla = () => {
    const { v, c, s } = datos();
    const tipo = f.tipo.value;
    let texto = v || tipo !== 'recordatorio' ? PLANTILLAS[tipo].texto(c, v, s) : null;
    if (texto === null) texto = v ? '(Este vehículo no tiene cambios de aceite registrados. Elige otra plantilla.)' : '(Selecciona un cliente para usar esta plantilla.)';
    f.texto.value = texto.replace('Hola , ', 'Hola, ').replace('Hola  ', 'Hola ');
    $('#msg-marcar-wrap').hidden = !(tipo === 'recordatorio' && s);
  };
  const pintarVeh = () => {
    const { v, c } = datos();
    $('#msg-veh').innerHTML = v
      ? `<strong>${esc(c.nombre)}</strong> · ${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.placa)} <button type="button" class="btn tiny ghost" id="msg-quitar">Quitar</button>`
      : '<span class="hint">Ningún cliente seleccionado. Busca uno o escribe un teléfono directamente.</span>';
    if (v) f.telefono.value = c.telefono;
    const q = $('#msg-quitar'); if (q) q.onclick = () => { vidSel = null; f.telefono.value = ''; pintarVeh(); aplicarPlantilla(); };
  };
  pintarVeh(); aplicarPlantilla();
  f.tipo.onchange = aplicarPlantilla;
  $('#msg-buscar').oninput = (e) => {
    const lista = buscarVehiculos(e.target.value).slice(0, 6);
    $('#msg-res').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
  };
  $('#msg-res').onclick = (e) => {
    const r = e.target.closest('[data-pick]'); if (!r) return;
    vidSel = r.dataset.pick; $('#msg-res').innerHTML = ''; $('#msg-buscar').value = '';
    if (f.tipo.value === 'recordatorio' && !ultimoServicio(vidSel)) f.tipo.value = 'libre';
    pintarVeh(); aplicarPlantilla();
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const tel = f.telefono.value.trim(); const texto = f.texto.value.trim();
    if (soloDigitos(tel).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos (ej. 0414-1234567).'); return; }
    if (texto.startsWith('(')) { alert('El mensaje no es válido. Elige otra plantilla o escribe el texto.'); return; }
    abrirWhatsApp(tel, texto);
    const { s } = datos();
    db.mensajes = db.mensajes || [];
    db.mensajes.push({ id: uid(), vehiculoId: vidSel, telefono: tel, tipo: f.tipo.value, texto, fecha: hoyISO(), creado: new Date().toISOString() });
    if (f.tipo.value === 'recordatorio' && s && f.marcar.checked) s.recordatorioEnviado = hoyISO();
    await guardar(); cerrarModal(); toast('Mensaje abierto en WhatsApp');
  };
}

// ===================== CITAS / CALENDARIO =====================
let calMes = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let diaSel = hoyISO();

function citasDel(iso) { return db.citas.filter((c) => c.fecha === iso).sort((a, b) => (a.hora || '').localeCompare(b.hora || '')); }
function tituloCita(ct) {
  const v = ct.vehiculoId && vehiculo(ct.vehiculoId);
  const c = v ? cliente(v.clienteId) : null;
  return { nombre: c ? c.nombre : ct.nombreLibre || 'Sin cliente', veh: v ? `${v.marca} ${v.modelo} · ${v.placa}` : (ct.vehiculoLibre || ''), tel: c ? c.telefono : ct.telefonoLibre || '' };
}

function renderCalendario() {
  const t = calMes.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  $('#cal-titulo').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  const primero = new Date(calMes);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero); inicio.setDate(1 - offset);
  const hoy = hoyISO();
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    const iso = isoDe(d);
    const cs = citasDel(iso);
    const cls = ['cal-dia', d.getMonth() !== calMes.getMonth() && 'otro-mes', iso === hoy && 'hoy', iso === diaSel && 'sel', cs.length && 'tiene'].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-dia="${iso}"><span class="num">${d.getDate()}</span>${cs.slice(0, 3).map((ct) => `<span class="ev ${ct.estado}">${esc(ct.hora || '')} ${esc(tituloCita(ct).nombre)}</span>`).join('')}${cs.length > 3 ? `<span class="ev">+${cs.length - 3} más</span>` : ''}</div>`;
    if (i === 34 && d.getMonth() !== calMes.getMonth()) break; // 5 semanas bastan
  }
  $('#cal-grid').innerHTML = html;
  renderDia();
}

function renderDia() {
  const d = parseISO(diaSel);
  $('#dia-titulo').textContent = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
  const cs = citasDel(diaSel);
  $('#dia-citas').innerHTML = cs.map((ct) => {
    const t = tituloCita(ct);
    return `<div class="cita ${ct.estado}" data-cid="${ct.id}">
      <strong>${esc(ct.hora ? fmtHora12(ct.hora) : 'Sin hora')} · ${esc(motivoCita(ct))}</strong>
      <small>${esc(t.nombre)}${t.veh ? ' · ' + esc(t.veh) : ''}</small>
      ${ct.notas ? `<small>${esc(ct.notas)}</small>` : ''}
      ${ct.estado !== 'pendiente' ? `<small>${ct.estado === 'completada' ? '✔ Completada' : '✖ Cancelada'}</small>` : ''}
      ${ct.estado === 'pendiente' ? `
        <div class="cita-avisos">
          ${ct.avisoCliente ? `<span class="aviso-ok">✔ Cliente avisado ${fmtFecha(ct.avisoCliente).slice(0, 5)}</span>` : ''}
          ${ct.avisoGrupo ? `<span class="aviso-ok">✔ Equipo avisado ${fmtFecha(ct.avisoGrupo).slice(0, 5)}</span>` : ''}
        </div>
        <div class="cita-acciones">
          <button type="button" class="btn tiny wa" data-cact="cliente">${ct.avisoCliente ? 'Recordar de nuevo' : 'Recordar al cliente'}</button>
          <button type="button" class="btn tiny ghost" data-cact="grupo">${ct.avisoGrupo ? 'Reenviar al grupo' : 'Avisar al equipo'}</button>
        </div>` : ''}
    </div>`;
  }).join('') || '<p class="vacio">Sin citas este día.</p>';
}

// ---------- Avisos de citas por WhatsApp ----------
function fmtHora12(h) {
  if (!/^\d{2}:\d{2}$/.test(h || '')) return '';
  let [hh, mm] = h.split(':').map(Number);
  const suf = hh < 12 ? 'a. m.' : 'p. m.';
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${suf}`;
}
function fechaLarga(iso) {
  const t = parseISO(iso).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function vehiculoCita(ct) {
  const v = ct.vehiculoId && vehiculo(ct.vehiculoId);
  return v ? { modelo: `${v.marca} ${v.modelo}`, placa: v.placa } : { modelo: ct.vehiculoLibre || '', placa: '' };
}

// Mensaje para el cliente (recordatorio de su cita)
// Motivo de la cita (si es "Otro", el texto que se escribió)
const motivoCita = (ct) => (ct.servicio === 'Otro' ? (ct.motivoOtro || 'Otro') : ct.servicio);

function varsCita(ct) {
  const t = tituloCita(ct); const v = vehiculoCita(ct);
  return {
    nombre: t.nombre && t.nombre !== 'Sin cliente' ? t.nombre : '', vehiculo: v.modelo || 'vehículo', placa: v.placa,
    fecha: fechaLarga(ct.fecha).toLowerCase(), hora: ct.hora ? fmtHora12(ct.hora) : 'hora por confirmar',
    motivo: motivoCita(ct).toLowerCase(),
  };
}

// Mensaje para el cliente (recordatorio de su cita) — editable en Configuración
function mensajeCitaCliente(ct) {
  return rellenarMensaje('citaCliente', varsCita(ct)).replace(/^Hola ,/, 'Hola,');
}

// Mensaje corto para el grupo del equipo (sin datos personales del cliente) — editable
function mensajeCitaGrupo(ct) {
  const vars = varsCita(ct);
  return rellenarMensaje('citaEquipo', { ...vars, fecha: fechaLarga(ct.fecha), motivo: motivoCita(ct) }).replace(/ · $/m, '');
}

async function enviarCitaCliente(ct) {
  let tel = tituloCita(ct).tel;
  if (soloDigitos(tel).length < 10) {
    tel = (prompt('Número de WhatsApp del cliente (ej: 0414-1234567):', tel || '') || '').trim();
    if (!tel) return;
    if (soloDigitos(tel).length < 10) { alert('El número debe tener al menos 10 dígitos.'); return; }
    if (!ct.vehiculoId) ct.telefonoLibre = tel;
  }
  const texto = mensajeCitaCliente(ct);
  abrirWhatsApp(tel, texto);
  ct.avisoCliente = hoyISO();
  db.mensajes.push({ id: uid(), vehiculoId: ct.vehiculoId || null, telefono: tel, tipo: 'cita', texto, fecha: hoyISO(), creado: new Date().toISOString() });
  await guardar();
  toast('Recordatorio de cita abierto en WhatsApp');
}

async function enviarCitaGrupo(ct) {
  // WhatsApp no permite abrir un grupo por enlace: se abre con el mensaje listo y se elige el grupo.
  abrirWhatsApp(null, mensajeCitaGrupo(ct));
  ct.avisoGrupo = hoyISO();
  await guardar();
  toast('Elige el grupo del equipo en WhatsApp y envía');
}

// El rol "taller" solo puede ver el calendario de citas (sin crear ni modificar)
const soloLectura = () => document.body.classList.contains('rol-taller');

function verCitaSoloLectura(ct) {
  const t = tituloCita(ct);
  abrirModal(`
    <div class="form-head"><h3>Cita</h3><button class="btn small ghost" data-act="cerrar">Cerrar</button></div>
    <div class="detalle-grid">
      <div><small>Fecha</small>${esc(fechaLarga(ct.fecha))}</div>
      <div><small>Hora</small>${esc(ct.hora ? fmtHora12(ct.hora) : 'Sin hora')}</div>
      <div><small>Motivo</small>${esc(motivoCita(ct))}</div>
      <div><small>Estado</small>${esc({ pendiente: 'Pendiente', completada: 'Completada', cancelada: 'Cancelada' }[ct.estado] || ct.estado)}</div>
      <div><small>Cliente</small>${esc(t.nombre)}</div>
      <div><small>Vehículo</small>${esc(t.veh || '—')}</div>
    </div>
    ${ct.notas ? `<p><small class="hint">Notas</small><br>${esc(ct.notas)}</p>` : ''}
    <p class="hint">Solo lectura: las citas las gestiona un administrador.</p>`);
}

function formCita(ct = null, preVid = null) {
  if (soloLectura()) { if (ct) verCitaSoloLectura(ct); return; }
  const nueva = !ct;
  ct = ct || { id: uid(), fecha: diaSel, hora: '', vehiculoId: preVid, servicio: 'Cambio de aceite', notas: '', estado: 'pendiente', nombreLibre: '', telefonoLibre: '', vehiculoLibre: '' };
  let vidSel = ct.vehiculoId || null;
  let otroDe = null; // cliente al que se le agrega un vehículo nuevo
  const resumenVeh = () => {
    if (otroDe) {
      const c = cliente(otroDe);
      return `<strong>${esc(c.nombre)}</strong> · nuevo vehículo <button type="button" class="btn tiny ghost" id="quitar-veh">Cancelar</button>
        <div id="cita-otro-veh" style="margin-top:8px">${camposVehiculoHTML()}</div>`;
    }
    if (!vidSel) return '<span class="hint">Ningún cliente seleccionado (puedes escribir los datos abajo si es cliente nuevo).</span>';
    const v = vehiculo(vidSel); const c = cliente(v.clienteId);
    return `<strong>${esc(c.nombre)}</strong> · ${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.placa)}
      <button type="button" class="btn tiny ghost" id="otro-veh">+ Otro vehículo de este cliente</button>
      <button type="button" class="btn tiny ghost" id="quitar-veh">Quitar</button>`;
  };
  abrirModal(`
    <h3>${nueva ? 'Agendar cita' : 'Editar cita'}</h3>
    <form id="form-cita">
      <div class="grid">
        <label>Fecha<input name="fecha" type="date" required value="${ct.fecha}"></label>
        <label>Hora<input name="hora" type="time" value="${esc(ct.hora)}"></label>
        <label>Motivo<select name="servicio" id="cita-motivo">${[...motivosCita(), 'Otro'].map((t) => `<option ${t === ct.servicio ? 'selected' : ''}>${esc(t)}</option>`).join('')}${[...motivosCita(), 'Otro'].includes(ct.servicio) ? '' : `<option selected>${esc(ct.servicio)}</option>`}</select></label>
        <label id="cita-motivo-otro-wrap" ${ct.servicio === 'Otro' ? '' : 'hidden'}>Escribe el motivo *<input name="motivoOtro" value="${esc(ct.motivoOtro || '')}" placeholder="Ej: instalación de suspensión"></label>
        <label>Estado<select name="estado">
          <option value="pendiente" ${ct.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${ct.estado === 'completada' ? 'selected' : ''}>Completada</option>
          <option value="cancelada" ${ct.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
        </select></label>
      </div>
      <fieldset style="margin-top:12px"><legend>Cliente / vehículo</legend>
        <div id="cita-veh" class="seleccion" style="margin:0 0 8px">${resumenVeh()}</div>
        <input id="cita-buscar" type="search" placeholder="Buscar cliente registrado por nombre, teléfono o placa…">
        <div id="cita-res" class="picker-list"></div>
        <div id="cita-libre" class="grid" style="margin-top:8px" ${vidSel ? 'hidden' : ''}>
          <label>Nombre (cliente no registrado)<input name="nombreLibre" value="${esc(ct.nombreLibre)}"></label>
          <label>Teléfono<input name="telefonoLibre" value="${esc(ct.telefonoLibre)}"></label>
          <label>Vehículo<input name="vehiculoLibre" value="${esc(ct.vehiculoLibre)}"></label>
        </div>
      </fieldset>
      <label>Notas<textarea name="notas" rows="2">${esc(ct.notas)}</textarea></label>
      <div class="actions" style="margin-top:12px">
        ${nueva ? '' : '<button type="button" class="btn danger" id="borrar-cita" style="margin-right:auto">Eliminar</button>'}
        <button type="button" class="btn ghost" data-act="cerrar">Cancelar</button>
        <button class="btn primary">Guardar cita</button>
      </div>
    </form>`);
  const pintarVeh = () => {
    $('#cita-veh').innerHTML = resumenVeh();
    $('#cita-libre').hidden = !!vidSel || !!otroDe;
    const q = $('#quitar-veh'); if (q) q.onclick = () => { vidSel = null; otroDe = null; pintarVeh(); };
    const o = $('#otro-veh'); if (o) o.onclick = () => { otroDe = vehiculo(vidSel).clienteId; vidSel = null; pintarVeh(); $('#cita-otro-veh [data-veh="marca"]').focus(); };
  };
  pintarVeh();
  $('#cita-motivo').onchange = (e) => {
    const otro = e.target.value === 'Otro';
    $('#cita-motivo-otro-wrap').hidden = !otro;
    if (otro) $('#cita-motivo-otro-wrap input').focus();
  };
  $('#cita-buscar').oninput = (e) => {
    const lista = buscarVehiculos(e.target.value).slice(0, 6);
    $('#cita-res').innerHTML = lista.map((v) => `<div class="resultado" data-pick="${v.id}"><div><strong>${esc(cliente(v.clienteId).nombre)}</strong><br><small>${esc(v.marca)} ${esc(v.modelo)}</small></div><strong>${esc(v.placa)}</strong></div>`).join('');
  };
  $('#cita-res').onclick = (e) => {
    const r = e.target.closest('[data-pick]'); if (!r) return;
    vidSel = r.dataset.pick; otroDe = null; $('#cita-res').innerHTML = ''; $('#cita-buscar').value = ''; pintarVeh();
  };
  $('#form-cita').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    if (otroDe) {
      const vid = crearVehiculoCliente(otroDe, leerCamposVehiculo($('#cita-otro-veh')));
      if (!vid) return;
      vidSel = vid; otroDe = null;
    }
    if (!vidSel && !(d.nombreLibre || '').trim()) { alert('Selecciona un cliente registrado o escribe el nombre.'); return; }
    const motivoOtro = d.servicio === 'Otro' ? (d.motivoOtro || '').trim() : '';
    if (d.servicio === 'Otro' && !motivoOtro) { alert('Escribe el motivo de la cita.'); $('#cita-motivo-otro-wrap input').focus(); return; }
    // Si cambia la fecha, la hora o el motivo, los avisos enviados quedan desactualizados
    if (!nueva && (ct.fecha !== d.fecha || ct.hora !== d.hora || ct.servicio !== d.servicio || (ct.motivoOtro || '') !== motivoOtro)) {
      if (ct.avisoCliente || ct.avisoGrupo) toast('La cita cambió: vuelve a avisar al cliente y al equipo');
      ct.avisoCliente = null; ct.avisoGrupo = null;
    }
    Object.assign(ct, {
      fecha: d.fecha, hora: d.hora, servicio: d.servicio, motivoOtro, estado: d.estado, notas: d.notas.trim(), vehiculoId: vidSel,
      nombreLibre: vidSel ? '' : d.nombreLibre.trim(), telefonoLibre: vidSel ? '' : d.telefonoLibre.trim(), vehiculoLibre: vidSel ? '' : d.vehiculoLibre.trim(),
    });
    if (nueva) { ct.creado = new Date().toISOString(); db.citas.push(ct); }
    diaSel = ct.fecha; const f = parseISO(ct.fecha); calMes = new Date(f.getFullYear(), f.getMonth(), 1);
    await guardar(); cerrarModal(); toast('Cita guardada');
  };
  const b = $('#borrar-cita');
  if (b) b.onclick = async () => { if (confirm('¿Eliminar esta cita?')) { db.citas = db.citas.filter((x) => x.id !== ct.id); await guardar(); cerrarModal(); } };
}

function agendarDesdeVehiculo(vid) {
  cerrarModal();
  irA('citas');
  if (diaSel < hoyISO()) diaSel = hoyISO();
  renderCalendario();
  formCita(null, vid);
}

// ===================== RENDER GENERAL =====================
function renderTodo() {
  renderListas();
  renderRegistros();
  renderRecordatorios();
  renderCalendario();
  renderCatalogo();
  if (typeof renderPresupuestos === 'function') renderPresupuestos(); // definido en presupuestos.js
  if (typeof renderRevisiones === 'function') renderRevisiones(); // definido en revisiones.js
  if (typeof renderReparaciones === 'function') renderReparaciones(); // definido en reparaciones.js
  if (typeof renderIngresos === 'function') renderIngresos(); // definido en ingresos.js
  aceiteNuevo.refrescar();
}

// ===================== EVENTOS =====================
function init() {
  aceiteNuevo = prepararAceite($('#aceite-nuevo'));
  $('#btn-nuevo-aceite').onclick = () => formAceite();
  
  $('#catalogo-aceites').onclick = (e) => { const p = e.target.closest('[data-aid]'); if (p) formAceite(aceitePorId(p.dataset.aid)); };
  $$('.subtab[data-svtab]').forEach((b) => (b.onclick = () => irSubtabSv(b.dataset.svtab)));
  // Al entrar a una pestaña se muestra la vista limpia (lista / formulario nuevo),
  // salvo que haya cambios sin guardar en lo que se estaba editando.
  $$('.tab').forEach((b) => (b.onclick = () => {
    irA(b.dataset.tab);
    if (b.dataset.tab === 'revisiones' && typeof reiniciarVistaRevisiones === 'function') reiniciarVistaRevisiones();
    if (b.dataset.tab === 'presupuestos' && typeof reiniciarVistaPresupuestos === 'function') reiniciarVistaPresupuestos();
  }));
  $('#btn-conectar').onclick = conectarCarpeta;
  $('#btn-exportar').onclick = exportar;
  const selWa = $('#sel-whatsapp');
  selWa.value = preferenciaWhatsApp();
  selWa.onchange = () => { try { localStorage.setItem(WA_KEY, selWa.value); } catch { /* sin almacenamiento */ } toast(`Este dispositivo abrirá WhatsApp ${selWa.value === 'business' ? 'Business' : 'normal'}`); };
  $('#input-importar').onchange = (e) => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; };

  // Nuevo registro
  $('#buscar-nuevo').oninput = renderResultadosNuevo;
  $('#resultados-nuevo').onclick = (e) => { const r = e.target.closest('[data-vid]'); if (r) seleccionarVehiculo(r.dataset.vid); };
  $('#btn-limpiar').onclick = limpiarFormulario;
  $('#btn-otro-vehiculo').onclick = otroVehiculo;
  form().onsubmit = guardarNuevo;
  // Campos de KM: se formatean con puntos de miles mientras se escribe.
  document.addEventListener('input', (e) => {
    if (!e.target.matches('input.km')) return;
    e.target.value = fmtNum(parseKm(e.target.value));
  });
  // Próximo KM = KM actual + 6.000 (se puede editar a mano).
  form().km.addEventListener('input', () => {
    const km = parseKm(form().km.value);
    form().proximoKm.value = Number.isFinite(km) ? fmtNum(km + CONFIG.kmIntervalo) : '';
  });

  // Registros
  $('#buscar-registros').oninput = renderRegistros;
  $('#filtro-estado').onchange = renderRegistros;
  $('#tabla-registros').onclick = (e) => { if (e.target.closest('[data-act]')) return; const r = e.target.closest('[data-vid]'); if (r) verDetalle(r.dataset.vid); };
  $('#btn-mensaje-manual').onclick = () => formMensaje();

  // Acciones dentro del modal y de recordatorios (delegación)
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const { act, vid, sid } = el.dataset;
    switch (act) {
      case 'cerrar': cerrarModal(); break;
      case 'ver': e.preventDefault(); verDetalle(vid); break;
      case 'nuevo-cambio': cerrarModal(); irA('nuevo'); seleccionarVehiculo(vid); break;
      case 'agendar': agendarDesdeVehiculo(vid); break;
      case 'editar-cv': editarClienteVehiculo(vid); break;
      case 'mensaje': formMensaje(vid); break;
      case 'pdf-servicios': pdfServicios(vid); break;
      case 'enviar-rep':
      case 'marcar-rep': {
        const r = (db.reparaciones || []).find((x) => x.id === el.dataset.repid);
        if (r) await registrarRecReparacion(r, act === 'enviar-rep');
        break;
      }
      case 'presupuesto': cerrarModal(); irA('presupuestos'); nuevoPresupuesto(vid); break;
      case 'revision': cerrarModal(); irA('revisiones'); nuevaRevision(vid); break;
      case 'ver-rev': e.preventDefault(); cerrarModal(); irA('revisiones'); abrirRevision(el.dataset.rid); break;
      case 'editar-s': editarServicio(sid); break;
      case 'borrar-s': {
        const s = db.servicios.find((x) => x.id === sid);
        if (confirm(`¿Borrar el cambio de aceite del ${fmtFecha(s.fecha)}?`)) { db.servicios = db.servicios.filter((x) => x.id !== sid); await guardar(); verDetalle(s.vehiculoId); }
        break;
      }
      case 'borrar-v': {
        const v = vehiculo(vid);
        if (confirm(`¿Eliminar ${v.marca} ${v.modelo} (${v.placa}) y todo su historial? Esto no se puede deshacer.`)) {
          db.vehiculos = db.vehiculos.filter((x) => x.id !== vid);
          db.servicios = db.servicios.filter((x) => x.vehiculoId !== vid);
          db.revisiones = db.revisiones.filter((x) => x.vehiculoId !== vid);
          db.citas.forEach((c) => { if (c.vehiculoId === vid) c.vehiculoId = null; });
          // Si el cliente se queda sin vehículos, se elimina también.
          if (!db.vehiculos.some((x) => x.clienteId === v.clienteId)) db.clientes = db.clientes.filter((c) => c.id !== v.clienteId);
          await guardar(); cerrarModal(); toast('Vehículo eliminado');
        }
        break;
      }
      case 'enviar':
      case 'reenviar': {
        const s = db.servicios.find((x) => x.id === sid); const v = s && vehiculo(s.vehiculoId); const c = v && cliente(v.clienteId);
        if (!c) break;
        abrirWhatsApp(c.telefono, mensajeRecordatorio(c, v, s));
        if (act === 'enviar') marcarEnviado(sid, true);
        break;
      }
      case 'marcar': marcarEnviado(sid, true); break;
      case 'desmarcar': marcarEnviado(sid, false); break;
    }
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });

  // Calendario
  $('#cal-prev').onclick = () => { calMes.setMonth(calMes.getMonth() - 1); renderCalendario(); };
  $('#cal-next').onclick = () => { calMes.setMonth(calMes.getMonth() + 1); renderCalendario(); };
  $('#cal-hoy').onclick = () => { const d = new Date(); calMes = new Date(d.getFullYear(), d.getMonth(), 1); diaSel = hoyISO(); renderCalendario(); };
  $('#cal-grid').onclick = (e) => {
    const d = e.target.closest('[data-dia]'); if (!d) return;
    diaSel = d.dataset.dia;
    const f = parseISO(diaSel);
    if (f.getMonth() !== calMes.getMonth()) calMes = new Date(f.getFullYear(), f.getMonth(), 1);
    renderCalendario();
  };
  $('#dia-citas').onclick = (e) => {
    const c = e.target.closest('[data-cid]'); if (!c) return;
    const ct = db.citas.find((x) => x.id === c.dataset.cid); if (!ct) return;
    const b = e.target.closest('[data-cact]');
    if (b?.dataset.cact === 'cliente') return enviarCitaCliente(ct);
    if (b?.dataset.cact === 'grupo') return enviarCitaGrupo(ct);
    formCita(ct);
  };
  $('#btn-nueva-cita').onclick = () => formCita();

  // Cargar datos (en modo nube los carga nube.js después de iniciar sesión)
  if (MODO_NUBE) { document.body.classList.add('sin-sesion'); limpiarFormulario(); renderTodo(); return; }
  const local = leerLocal(); if (local) db = local;
  limpiarFormulario();
  renderTodo();
  if (!soportaCarpeta) setEstado('Guardando solo en este navegador (usa Chrome o Edge)', 'warn');
  else reconectar().then((ok) => { if (!ok) setEstado(local ? 'Datos en el navegador · conecta la carpeta' : 'Conecta la carpeta "datos"', 'warn'); });
}

init();

/* Jacks4WD – Modo nube (Supabase)
 * Inicio de sesión con usuario y contraseña, roles (admin / taller),
 * carga de datos desde la nube, guardado automático de cada cambio y
 * actualización periódica con los cambios hechos en otros dispositivos.
 * Usa la API REST de Supabase directamente (sin librerías externas).
 */
const Nube = (() => {
  const CFG = typeof NUBE_CONFIG !== 'undefined' ? NUBE_CONFIG : null;
  const activa = !!(CFG && CFG.url && CFG.clave);
  const TABLAS = ['clientes', 'vehiculos', 'servicios', 'citas', 'mensajes', 'aceites', 'revisiones', 'presupuestos', 'reparaciones', 'ingresos'];
  const noDisponibles = new Set(); // tablas que aún no existen en Supabase
  // Lo que el rol "taller" puede escribir (el servidor lo hace cumplir de todas formas)
  // Citas y reparaciones: solo lectura para el taller.
  const ESCRITURA_TALLER = { clientes: 'ed', vehiculos: 'ed', servicios: 'ed', revisiones: 'ed', ingresos: 'ed', mensajes: 'crea' };
  const SESION_KEY = 'jacks4wd-sesion';

  let sesion = null;      // { access_token, refresh_token, expires_at, email }
  let perfil = null;      // { rol, nombre }
  let snapshot = {};      // tabla → Map(id → JSON guardado)
  let conocido = {};      // tabla → Map(id → fecha de actualización en el servidor)
  let sincronizando = null;
  let temporizador = null;

  const esAdmin = () => perfil?.rol === 'admin';

  // ---------- Sesión ----------
  function guardarSesion(s) {
    sesion = s;
    try { if (s) localStorage.setItem(SESION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESION_KEY); } catch { /* sin almacenamiento */ }
  }
  function leerSesion() { try { return JSON.parse(localStorage.getItem(SESION_KEY) || 'null'); } catch { return null; } }

  async function pedirToken(tipo, cuerpo) {
    const r = await fetch(`${CFG.url}/auth/v1/token?grant_type=${tipo}`, {
      method: 'POST', headers: { apikey: CFG.clave, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || d.message || 'No se pudo iniciar sesión');
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, email: d.user?.email || sesion?.email || '' };
  }

  async function asegurarToken() {
    if (!sesion) throw new Error('SIN_SESION');
    if (Date.now() < sesion.expires_at - 60000) return;
    try { guardarSesion(await pedirToken('refresh_token', { refresh_token: sesion.refresh_token })); }
    catch { guardarSesion(null); throw new Error('SIN_SESION'); }
  }

  // ---------- API REST ----------
  async function api(ruta, { method = 'GET', body, prefer } = {}) {
    await asegurarToken();
    const headers = { apikey: CFG.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(CFG.url + '/rest/v1/' + ruta, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if (!r.ok) {
      if (r.status === 401) { guardarSesion(null); throw new Error('SIN_SESION'); }
      let msg = txt; try { const j = JSON.parse(txt); msg = j.message || txt; } catch { /* texto */ }
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return txt ? JSON.parse(txt) : null;
  }

  async function leerTodo(tabla, select = 'id,data,actualizado') {
    const out = []; const lote = 1000;
    for (let desde = 0; ; desde += lote) {
      const filas = await api(`${tabla}?select=${select}&order=id&limit=${lote}&offset=${desde}`);
      out.push(...filas);
      if (filas.length < lote) break;
    }
    return out;
  }

  const trozos = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
  const listaIn = (ids) => ids.map((x) => encodeURIComponent(x)).join(',');

  // ---------- Carga ----------
  function filasAConfig(filas) {
    const cfg = {};
    filas.forEach((f) => {
      if (f.id === 'revision') cfg.revision = f.data;
      if (f.id === 'tecnicos') cfg.tecnicos = f.data?.lista;
      if (f.id === 'plantillasPres') cfg.plantillasPres = f.data?.lista;
      if (f.id === 'mensajes') cfg.mensajes = f.data;
      if (f.id === 'motivosCita') cfg.motivosCita = f.data?.lista;
    });
    return cfg;
  }
  function configAFilas() {
    const filas = [];
    if (db.config?.revision) filas.push({ id: 'revision', data: db.config.revision });
    if (db.config?.tecnicos) filas.push({ id: 'tecnicos', data: { lista: db.config.tecnicos } });
    if (db.config?.plantillasPres) filas.push({ id: 'plantillasPres', data: { lista: db.config.plantillasPres } });
    if (db.config?.mensajes) filas.push({ id: 'mensajes', data: db.config.mensajes });
    if (db.config?.motivosCita) filas.push({ id: 'motivosCita', data: { lista: db.config.motivosCita } });
    return filas;
  }
  const filasDe = (tabla) => (tabla === 'config' ? configAFilas() : (db[tabla] || []).map((x) => ({ id: x.id, data: x })));

  function tomarFoto(tabla, filas) {
    snapshot[tabla] = new Map(filas.map((f) => [f.id, JSON.stringify(f.data)]));
  }

  async function cargar() {
    setEstado('Cargando datos de la nube…', 'warn');
    const datos = {}; const crudo = {};
    for (const t of [...TABLAS, 'config']) {
      let filas = [];
      try { filas = await leerTodo(t); noDisponibles.delete(t); }
      catch (e) { if (e.status === 404) { noDisponibles.add(t); console.warn('Falta la tabla', t); } else throw e; }
      crudo[t] = filas;
      conocido[t] = new Map(filas.map((f) => [f.id, f.actualizado]));
      if (t === 'config') datos.config = filasAConfig(filas);
      else datos[t] = filas.map((f) => ({ ...f.data, id: f.id }));
    }
    // Si el catálogo de aceites está vacío en la nube, se usa el inicial (el admin lo sube)
    if (!datos.aceites.length) delete datos.aceites;
    db = normalizarDatos(datos);
    // La foto se toma con los datos ya normalizados para no re-subir todo;
    // las tablas vacías en el servidor quedan vacías para que se suba lo inicial.
    [...TABLAS, 'config'].forEach((t) => (crudo[t].length ? tomarFoto(t, filasDe(t)) : (snapshot[t] = new Map())));
    return crudo;
  }

  // ---------- Guardado (sube solo lo que cambió) ----------
  function puedeEscribir(tabla, accion) {
    if (esAdmin()) return true;
    const p = ESCRITURA_TALLER[tabla];
    if (!p) return false;
    if (accion === 'borrar') return p === 'todo';
    if (accion === 'editar') return p !== 'crea';
    return true;
  }

  async function sincronizarAhora() {
    let errores = 0;
    for (const t of [...TABLAS, 'config'].filter((x) => !noDisponibles.has(x))) {
      const actuales = filasDe(t);
      const prev = snapshot[t] || new Map();
      const nuevos = []; const cambiados = [];
      const idsActuales = new Set();
      actuales.forEach((f) => {
        idsActuales.add(f.id);
        const json = JSON.stringify(f.data);
        if (!prev.has(f.id)) nuevos.push(f); else if (prev.get(f.id) !== json) cambiados.push(f);
      });
      const borrados = [...prev.keys()].filter((id) => !idsActuales.has(id));

      try {
        if (nuevos.length && puedeEscribir(t, 'crear')) {
          for (const lote of trozos(nuevos, 200)) {
            const res = await api(`${t}?select=id,actualizado`, { method: 'POST', body: lote, prefer: 'return=representation' });
            res.forEach((r) => conocido[t].set(r.id, r.actualizado));
            lote.forEach((f) => prev.set(f.id, JSON.stringify(f.data)));
          }
        }
        if (cambiados.length && puedeEscribir(t, 'editar')) {
          for (const lote of trozos(cambiados, 200)) {
            const res = await api(`${t}?select=id,actualizado`, { method: 'POST', body: lote, prefer: 'return=representation,resolution=merge-duplicates' });
            res.forEach((r) => conocido[t].set(r.id, r.actualizado));
            lote.forEach((f) => prev.set(f.id, JSON.stringify(f.data)));
          }
        }
        if (borrados.length && puedeEscribir(t, 'borrar')) {
          for (const lote of trozos(borrados, 100)) {
            await api(`${t}?id=in.(${listaIn(lote)})`, { method: 'DELETE' });
            lote.forEach((id) => { prev.delete(id); conocido[t].delete(id); });
          }
        }
        snapshot[t] = prev;
      } catch (e) {
        if (e.message === 'SIN_SESION') throw e;
        console.error('Error guardando', t, e);
        errores++;
      }
    }
    return errores;
  }

  async function sincronizar() {
    // Encadenar guardados para que nunca corran dos a la vez
    const anterior = sincronizando || Promise.resolve();
    const actual = anterior.catch(() => {}).then(async () => {
      try {
        setEstado('Guardando…', 'warn');
        const errores = await sincronizarAhora();
        if (errores) { setEstado('Algunos cambios no se guardaron', 'warn'); toast('⚠ Algunos cambios no se pudieron guardar en la nube. Revisa la conexión.'); }
        else setEstado(estadoListo(), 'ok');
      } catch (e) {
        if (e.message === 'SIN_SESION') { mostrarLogin('Tu sesión expiró. Vuelve a entrar; tus cambios se guardarán al entrar.'); return; }
        setEstado('Sin conexión: cambios pendientes', 'warn');
        toast('⚠ Sin conexión con la nube. Los cambios se guardarán cuando vuelva la conexión.');
      }
    });
    sincronizando = actual;
    return actual;
  }

  // ---------- Actualización con cambios de otros dispositivos ----------
  const editando = () => (typeof presDirty !== 'undefined' && presDirty) || (typeof rvDirty !== 'undefined' && rvDirty)
    || (typeof cfgDirty !== 'undefined' && cfgDirty) || (typeof tecDirty !== 'undefined' && tecDirty) || $('#modal').open;

  async function traerCambios() {
    if (!sesion || document.hidden || editando()) return;
    await (sincronizando || Promise.resolve()).catch(() => {});
    let hubo = false;
    try {
      for (const t of [...TABLAS, 'config'].filter((x) => !noDisponibles.has(x))) {
        const marcas = await leerTodo(t, 'id,actualizado');
        const prevK = conocido[t] || new Map();
        const idsServidor = new Set(marcas.map((m) => m.id));
        const cambiados = marcas.filter((m) => prevK.get(m.id) !== m.actualizado).map((m) => m.id);
        const borrados = [...prevK.keys()].filter((id) => !idsServidor.has(id));
        if (!cambiados.length && !borrados.length) continue;
        hubo = true;
        let filas = [];
        for (const lote of trozos(cambiados, 100)) filas.push(...(await api(`${t}?select=id,data,actualizado&id=in.(${listaIn(lote)})`)));
        if (t === 'config') {
          const todas = await leerTodo('config');
          db.config = normalizarDatos({ config: filasAConfig(todas) }).config;
          conocido[t] = new Map(todas.map((f) => [f.id, f.actualizado]));
          tomarFoto('config', configAFilas());
          continue;
        }
        const limpias = normalizarDatos({ [t]: filas.map((f) => ({ ...f.data, id: f.id })) })[t];
        const porId = new Map(limpias.map((x) => [x.id, x]));
        db[t] = db[t].filter((x) => !borrados.includes(x.id)).map((x) => (porId.has(x.id) ? porId.get(x.id) : x));
        limpias.forEach((x) => { if (!db[t].some((y) => y.id === x.id)) db[t].push(x); });
        filas.forEach((f) => { prevK.set(f.id, f.actualizado); snapshot[t].set(f.id, JSON.stringify(porId.get(f.id) || f.data)); });
        borrados.forEach((id) => { prevK.delete(id); snapshot[t].delete(id); });
        conocido[t] = prevK;
      }
      if (hubo) { renderTodo(); setEstado(estadoListo(), 'ok'); }
    } catch (e) {
      if (e.message === 'SIN_SESION') mostrarLogin('Tu sesión expiró. Vuelve a entrar.');
      else setEstado('Sin conexión', 'warn');
    }
  }

  // ---------- Interfaz ----------
  const estadoListo = () => `☁ Nube · ${perfil?.nombre || ''} (${esAdmin() ? 'administrador' : 'taller'})`;

  function aplicarRol() {
    document.body.classList.toggle('rol-taller', !esAdmin());
    document.body.classList.toggle('rol-admin', esAdmin());
    // El taller ve la pestaña como "Reparaciones" (solo lectura, sin presupuestos)
    const tabPres = $('#tab-btn-presupuestos');
    if (tabPres) tabPres.textContent = esAdmin() ? 'Presupuestos' : 'Reparaciones';
    if (!esAdmin() && typeof irSubtabPres === 'function') irSubtabPres('reparaciones');
    // Si el taller estaba en una pestaña restringida, volver al inicio
    const activa = $('.tab.active')?.dataset.tab;
    if (!esAdmin() && ['recordatorios', 'config'].includes(activa)) irA('registros');
  }

  function prepararCabecera() {
    $('#btn-conectar').hidden = true;
    let salir = $('#btn-salir');
    if (!salir) {
      const clave = document.createElement('button');
      clave.id = 'btn-clave'; clave.className = 'btn small ghost solo-admin'; clave.textContent = 'Cambiar contraseña';
      $('.storage').appendChild(clave);
      clave.onclick = cambiarContrasena;
      salir = document.createElement('button');
      salir.id = 'btn-salir'; salir.className = 'btn small ghost'; salir.textContent = 'Cerrar sesión';
      $('.storage').appendChild(salir);
      salir.onclick = cerrarSesion;
    }
  }

  // ---------- Cambiar la contraseña del usuario que inició sesión ----------
  function cambiarContrasena() {
    if (!esAdmin()) { avisar('Solo el administrador puede cambiar contraseñas.'); return; }
    abrirModal(`
      <h3>Cambiar contraseña</h3>
      <p class="hint">Cambia la contraseña del usuario con el que entraste (<strong>${esc((sesion?.email || '').split('@')[0])}</strong>). Usa al menos 10 caracteres, mezclando letras y números.</p>
      <form id="form-clave">
        <label>Contraseña actual<input name="c0" type="password" autocomplete="current-password" required></label>
        <label style="margin-top:8px">Nueva contraseña<input name="c1" type="password" autocomplete="new-password" minlength="10" required></label>
        <label style="margin-top:8px">Repite la nueva contraseña<input name="c2" type="password" autocomplete="new-password" minlength="10" required></label>
        <p id="clave-msg" class="hint" style="color:var(--bad)"></p>
        <div class="actions"><button type="button" class="btn ghost" data-act="cerrar">Cancelar</button><button class="btn primary">Guardar contraseña</button></div>
      </form>`);
    $('#form-clave').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const msg = $('#clave-msg');
      if (!f.c0.value) { msg.textContent = 'Escribe tu contraseña actual.'; return; }
      if (f.c1.value !== f.c2.value) { msg.textContent = 'Las contraseñas no coinciden.'; return; }
      if (f.c1.value.length < 10 || !/[a-zA-Z]/.test(f.c1.value) || !/\d/.test(f.c1.value)) { msg.textContent = 'Usa al menos 10 caracteres con letras y números.'; return; }
      try {
        // Verificar la contraseña actual antes de cambiarla
        try { guardarSesion(await pedirToken('password', { email: sesion.email, password: f.c0.value })); }
        catch { msg.textContent = 'La contraseña actual no es correcta.'; f.c0.value = ''; f.c0.focus(); return; }
        const r = await fetch(`${CFG.url}/auth/v1/user`, {
          method: 'PUT', headers: { apikey: CFG.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: f.c1.value }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.msg || d.message || d.error_description || 'No se pudo cambiar');
        f.c0.value = ''; f.c1.value = ''; f.c2.value = '';
        cerrarModal();
        toast('Contraseña cambiada. Úsala la próxima vez que inicies sesión.');
      } catch (err) {
        msg.textContent = /same/i.test(err.message) ? 'La nueva contraseña debe ser distinta de la actual.' : 'No se pudo cambiar: ' + err.message;
      }
    };
  }

  // ---------- Cierre de sesión por inactividad ----------
  const ACTIVIDAD_KEY = 'jacks4wd-actividad';
  const minutosInactividad = () => CFG.minutosInactividad || 30;
  function marcarActividad() { try { localStorage.setItem(ACTIVIDAD_KEY, String(Date.now())); } catch { /* sin almacenamiento */ } }
  function inactivoDemasiado() {
    let ult = 0; try { ult = Number(localStorage.getItem(ACTIVIDAD_KEY)) || 0; } catch { /* sin almacenamiento */ }
    return ult && Date.now() - ult > minutosInactividad() * 60000;
  }
  let vigilando = false;
  function vigilarInactividad() {
    marcarActividad();
    if (vigilando) return;
    vigilando = true;
    let ultimaMarca = 0;
    const alActuar = () => { if (Date.now() - ultimaMarca > 15000) { ultimaMarca = Date.now(); marcarActividad(); } };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => document.addEventListener(ev, alActuar, { passive: true }));
    setInterval(async () => {
      if (!sesion || !inactivoDemasiado()) return;
      await (sincronizando || Promise.resolve()).catch(() => {});
      if (typeof presDirty !== 'undefined') presDirty = false;
      if (typeof rvDirty !== 'undefined') rvDirty = false;
      await cerrarSesion(true);
      mostrarLogin(`Por seguridad se cerró la sesión tras ${minutosInactividad()} minutos sin uso.`);
    }, 60000);
  }

  function mostrarLogin(mensaje = '') {
    clearInterval(temporizador);
    document.body.classList.add('sin-sesion');
    let el = $('#login');
    if (!el) {
      el = document.createElement('div');
      el.id = 'login';
      el.innerHTML = `
        <form id="form-login" class="login-caja" autocomplete="on">
          <img src="img/logo.png" alt="Jacks" class="login-logo">
          <h2>Iniciar sesión</h2>
          <p id="login-msg" class="hint"></p>
          <label>Usuario<input name="usuario" autocomplete="username" autocapitalize="none" required placeholder="admin o taller"></label>
          <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
          <button class="btn primary" type="submit">Entrar</button>
        </form>`;
      document.body.appendChild(el);
      $('#form-login').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target; const btn = f.querySelector('button');
        let usuario = f.usuario.value.trim().toLowerCase();
        if (!usuario.includes('@')) usuario += '@' + CFG.dominioUsuarios;
        btn.disabled = true; btn.textContent = 'Entrando…'; $('#login-msg').textContent = '';
        try {
          guardarSesion(await pedirToken('password', { email: usuario, password: f.clave.value }));
          f.clave.value = '';
          await entrar();
        } catch (err) {
          $('#login-msg').textContent = /invalid/i.test(err.message) ? 'Usuario o contraseña incorrectos.' : 'No se pudo entrar: ' + err.message;
        } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
      };
    }
    $('#login-msg').textContent = mensaje;
    setTimeout(() => el.querySelector('[name="usuario"]').focus(), 50);
  }

  async function cerrarSesion(automatico = false) {
    if (automatico !== true && ((typeof presDirty !== 'undefined' && presDirty) || (typeof rvDirty !== 'undefined' && rvDirty))) {
      if (!await confirmarSinGuardar()) return;
    }
    await (sincronizando || Promise.resolve()).catch(() => {});
    try { await fetch(`${CFG.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: CFG.clave, Authorization: 'Bearer ' + sesion?.access_token } }); } catch { /* sin conexión */ }
    guardarSesion(null); perfil = null;
    if (typeof presDirty !== 'undefined') presDirty = false;
    if (typeof rvDirty !== 'undefined') rvDirty = false;
    db = vacio(); snapshot = {}; conocido = {};
    renderTodo();
    mostrarLogin('Sesión cerrada.');
  }

  // Si la nube está vacía, el administrador puede subir los datos que ya tiene
  async function ofrecerMigracion() {
    if (!esAdmin() || db.clientes.length || db.vehiculos.length || db.revisiones.length || db.presupuestos.length) return;
    const local = leerLocal();
    const hayLocal = local && (local.clientes.length || local.citas.length || local.presupuestos.length);
    abrirModal(`
      <h3>La base de datos en la nube está vacía</h3>
      <p>¿Quieres subir los datos que ya tienes registrados? Solo hay que hacerlo una vez.</p>
      <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
        ${hayLocal ? `<button class="btn primary" id="mig-local">Subir los datos de este equipo (${local.clientes.length} clientes)</button>` : ''}
        <label class="btn ${hayLocal ? 'ghost' : 'primary'}">Elegir archivo taller.json o copia exportada
          <input type="file" id="mig-archivo" accept=".json,application/json" hidden>
        </label>
        <button class="btn ghost" data-act="cerrar">Empezar sin datos</button>
      </div>
      <p class="hint">El archivo está en la carpeta <strong>jacks4wd/datos/taller.json</strong>.</p>`);
    const subir = async (datos) => {
      db = normalizarDatos(datos);
      cerrarModal();
      toast('Subiendo datos a la nube…');
      await sincronizar();
      renderTodo();
      if (typeof nuevaRevision === 'function' && !rvDirty) { rvEdit = revisionVacia(); pintarEditorRev(); }
      toast(`Listo: ${db.clientes.length} clientes y ${db.vehiculos.length} vehículos en la nube`);
    };
    const bl = $('#mig-local'); if (bl) bl.onclick = () => subir(local);
    $('#mig-archivo').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { subir(JSON.parse(await f.text())); } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
    };
  }

  async function entrar() {
    // Perfil y rol
    const uid = JSON.parse(atob(sesion.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
    const p = await api(`perfiles?select=rol,nombre&id=eq.${uid}`);
    if (!p.length) { guardarSesion(null); throw new Error('Este usuario no tiene un perfil asignado. Revisa el paso 4 de la guía.'); }
    perfil = p[0];
    await cargar();
    document.body.classList.remove('sin-sesion');
    aplicarRol();
    prepararCabecera();
    limpiarFormulario();
    renderTodo();
    if (typeof revisionVacia === 'function' && typeof rvDirty !== 'undefined' && !rvDirty) { rvEdit = revisionVacia(); pintarEditorRev(); }
    setEstado(estadoListo(), 'ok');
    clearInterval(temporizador);
    temporizador = setInterval(traerCambios, (CFG.segundosActualizacion || 30) * 1000);
    vigilarInactividad();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) traerCambios(); });
    ofrecerMigracion();
    if (esAdmin() && noDisponibles.size) {
      toast(`Falta crear en Supabase: ${[...noDisponibles].join(', ')}. Ejecuta el SQL actualizado (supabase/esquema.sql).`);
    }
  }

  async function iniciar() {
    if (!activa) return;
    document.body.classList.add('modo-nube');
    prepararCabecera();
    const s = leerSesion();
    // Sesión guardada pero sin uso por mucho tiempo: se pide iniciar sesión de nuevo
    if (s?.refresh_token && inactivoDemasiado()) {
      sesion = s; await cerrarSesion(true);
      mostrarLogin(`Por seguridad se cerró la sesión tras ${minutosInactividad()} minutos sin uso.`);
      return;
    }
    if (s?.refresh_token) {
      sesion = s;
      try { await entrar(); return; } catch (e) { guardarSesion(null); mostrarLogin(e.message === 'SIN_SESION' ? '' : 'No se pudo conectar: ' + e.message); return; }
    }
    mostrarLogin();
  }

  return { activa, iniciar, sincronizar, esAdmin, get perfil() { return perfil; } };
})();

Nube.iniciar();

/* Jacks4WD – Registro de clientes (solo administrador)
 * Todos los clientes creados desde cualquier pestaña, con búsqueda por nombre, teléfono,
 * placa o vehículo, y las acciones: ver, editar (cliente y vehículos), unir clientes
 * duplicados y eliminar (solo si no tienen historial, para no perder trabajos registrados).
 */

// Cuántos registros tiene un vehículo en cada parte del sistema
function usoVehiculo(vid) {
  const n = (arr) => (arr || []).filter((x) => x.vehiculoId === vid).length;
  return {
    servicios: n(db.servicios), revisiones: n(db.revisiones), reparaciones: n(db.reparaciones),
    presupuestos: n(db.presupuestos), diagnosticos: n(db.ingresos), citas: n(db.citas),
  };
}
const totalUso = (u) => Object.values(u).reduce((a, b) => a + b, 0);
const vehiculosDe = (cid) => db.vehiculos.filter((v) => v.clienteId === cid);
function textoUso(u) {
  const nombres = { servicios: 'cambio(s) de aceite', revisiones: 'revisión(es)', reparaciones: 'reparación(es)', presupuestos: 'presupuesto(s)', diagnosticos: 'diagnóstico(s)', citas: 'cita(s)' };
  return Object.entries(u).filter(([, v]) => v).map(([k, v]) => `${v} ${nombres[k]}`).join(', ');
}

function renderClientes() {
  const cont = $('#tab-clientes'); if (!cont) return;
  if (!$('#cli-buscar')) {
    cont.innerHTML = `
      <div class="card">
        <div class="form-head">
          <div><h2>Registro de clientes</h2><p class="hint" style="margin:0">Todos los clientes registrados desde cualquier pestaña. Busca por nombre, teléfono, placa o vehículo.</p></div>
          <div class="cli-cab-acc"><span class="contador" id="cli-total"></span>
          <button type="button" class="btn primary" id="cli-nuevo">+ Crear nuevo cliente</button></div>
        </div>
        <input id="cli-buscar" type="search" placeholder="Buscar por nombre, teléfono, placa, marca o modelo…" autocomplete="off">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Teléfono</th><th>Vehículos</th><th>Historial</th><th></th></tr></thead>
            <tbody id="cli-tabla"></tbody>
          </table>
        </div>
        <p id="cli-vacio" class="vacio" hidden></p>
      </div>`;
    $('#cli-buscar').oninput = renderClientes;
    $('#cli-nuevo').onclick = crearClienteNuevo;
    $('#cli-tabla').onclick = (e) => {
      const tr = e.target.closest('[data-cid]'); if (!tr) return;
      const b = e.target.closest('[data-cli]');
      const accion = b ? b.dataset.cli : 'ver';
      if (accion === 'ver') verCliente(tr.dataset.cid);
      if (accion === 'editar') editarCliente(tr.dataset.cid);
      if (accion === 'eliminar') eliminarCliente(tr.dataset.cid);
    };
  }
  const q = norm($('#cli-buscar').value).trim();
  const qd = soloDigitos($('#cli-buscar').value);
  const lista = [...db.clientes]
    .map((c) => ({ c, vs: vehiculosDe(c.id) }))
    .filter(({ c, vs }) => !q || norm([c.nombre, c.telefono, ...vs.map((v) => `${v.marca} ${v.modelo} ${v.placa} ${v.placa.replace(/[^A-Za-z0-9]/g, '')}`)].join(' ')).includes(q)
      || (qd.length >= 4 && soloDigitos(c.telefono).includes(qd)))
    .sort((a, b) => a.c.nombre.localeCompare(b.c.nombre, 'es'));
  $('#cli-total').textContent = `${db.clientes.length} cliente(s)`;
  $('#cli-tabla').innerHTML = lista.map(({ c, vs }) => {
    const uso = vs.map((v) => usoVehiculo(v.id)).reduce((a, u) => { Object.keys(u).forEach((k) => (a[k] = (a[k] || 0) + u[k])); return a; }, {});
    return `<tr data-cid="${c.id}">
      <td><strong>${esc(c.nombre)}</strong></td>
      <td>${esc(c.telefono)}</td>
      <td>${vs.map((v) => `<span class="cli-veh">${esc(v.marca)} ${esc(v.modelo)} · <strong>${esc(v.placa)}</strong>${v.token ? ' <span title="Tiene enlace / QR">🔗</span>' : ''}</span>`).join('') || '<span class="hint">Sin vehículos</span>'}</td>
      <td><small>${esc(textoUso(uso)) || '<span class="hint">Sin historial</span>'}</small></td>
      <td class="acciones-fila">
        <button class="btn tiny ghost" data-cli="ver" title="Ver">👁</button>
        <button class="btn tiny ghost" data-cli="editar" title="Editar">✏️</button>
        <button class="btn tiny danger" data-cli="eliminar" title="Eliminar">🗑</button>
      </td>
    </tr>`;
  }).join('');
  const v = $('#cli-vacio');
  v.hidden = lista.length > 0;
  v.textContent = db.clientes.length ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.';
}

// "+ Crear nuevo cliente": cliente con (opcionalmente) su primer vehículo
function crearClienteNuevo() {
  abrirModal(`
    <h3>Nuevo cliente</h3>
    <div class="grid">
      <label>Nombre *<input id="cn-nombre" autocomplete="off"></label>
      <label>Teléfono *<input id="cn-telefono" placeholder="0414-1234567" inputmode="tel" autocomplete="off"></label>
    </div>
    <h4 class="subtitulo">Vehículo <span class="opt">(opcional; puedes agregar más después con «Editar»)</span></h4>
    <div class="grid">
      <label>Marca<input id="cn-marca" list="lista-marcas" autocomplete="off"></label>
      <label>Modelo<input id="cn-modelo" autocomplete="off"></label>
      <label>Placa<input id="cn-placa" class="upper" autocomplete="off"></label>
      <label>Año<input id="cn-anio" inputmode="numeric" maxlength="4"></label>
      <label>Color<input id="cn-color"></label>
    </div>
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn ghost" data-act="cerrar">Cancelar</button>
      <button type="button" class="btn primary" id="cn-guardar">Registrar cliente</button>
    </div>`);
  $('#cn-nombre').focus();
  $('#cn-guardar').onclick = async () => {
    const d = {};
    ['nombre', 'telefono', 'marca', 'modelo', 'placa', 'anio', 'color'].forEach((k) => (d[k] = $('#cn-' + k).value.trim()));
    if (!d.nombre) { alert('Escribe el nombre del cliente.'); $('#cn-nombre').focus(); return; }
    if (soloDigitos(d.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos.'); $('#cn-telefono').focus(); return; }
    const conVehiculo = d.marca || d.modelo || d.placa || d.anio || d.color;
    let cid;
    if (conVehiculo) {
      if (!d.marca || !d.modelo || !d.placa) { alert('Para registrar el vehículo completa marca, modelo y placa (o deja los datos del vehículo en blanco).'); return; }
      // Crea el cliente y el vehículo (avisa si la placa o el teléfono ya existen)
      const vid = await obtenerVehiculoNuevo(d); if (!vid) return;
      cid = vehiculo(vid).clienteId;
    } else {
      const existente = db.clientes.find((c) => telWhatsApp(c.telefono) === telWhatsApp(d.telefono));
      if (existente) { avisar(`Ya existe un cliente con ese teléfono: ${existente.nombre}. Búscalo en la lista para editarlo.`); return; }
      cid = uid();
      db.clientes.push({ id: cid, nombre: d.nombre, telefono: d.telefono, creado: new Date().toISOString() });
    }
    await guardar();
    toast(`Cliente registrado: ${cliente(cid)?.nombre || d.nombre}`);
    if ($('#cli-buscar')) { $('#cli-buscar').value = ''; renderClientes(); }
    verCliente(cid);
  };
}

function verCliente(cid) {
  const c = cliente(cid); if (!c) return;
  const vs = vehiculosDe(cid);
  abrirModal(`
    <div class="form-head"><h3>${esc(c.nombre)}</h3><button class="btn small ghost" data-act="cerrar">Cerrar</button></div>
    <div class="detalle-grid">
      <div><small>Teléfono</small>${esc(c.telefono)}</div>
      <div><small>Registrado</small>${c.creado ? fmtFecha(c.creado.slice(0, 10)) : '—'}</div>
      <div><small>Vehículos</small>${vs.length}</div>
    </div>
    <div class="historial">
      <h4>Vehículos</h4>
      ${vs.map((v) => { const u = usoVehiculo(v.id); return `
        <div class="servicio">
          <div class="top"><strong>${esc(v.marca)} ${esc(v.modelo)}${v.anio ? ' ' + esc(v.anio) : ''} · ${esc(v.placa)}</strong>
            <span><button class="btn tiny ghost" data-cliver="servicios" data-vid="${v.id}">Ver en Servicios</button>
            <button class="btn tiny ghost" data-cliver="qr" data-vid="${v.id}">${v.token ? 'Enlace / QR' : 'Crear enlace / QR'}</button></span></div>
          <small>${esc(textoUso(u)) || 'Sin historial'}${v.color ? ' · Color: ' + esc(v.color) : ''}</small>
        </div>`; }).join('') || '<p class="hint">Sin vehículos.</p>'}
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn small primary" data-cliver="editar">✏️ Editar</button>
    </div>`);
  $('#modal-body').onclick = (e) => {
    const b = e.target.closest('[data-cliver]'); if (!b) return;
    if (b.dataset.cliver === 'servicios') verDetalle(b.dataset.vid);
    if (b.dataset.cliver === 'qr') abrirEnlaceCliente(b.dataset.vid, 'clientes');
    if (b.dataset.cliver === 'editar') editarCliente(cid);
  };
}

function editarCliente(cid) {
  const c = cliente(cid); if (!c) return;
  const vs = vehiculosDe(cid).map((v) => ({ ...v }));
  const nuevos = [];
  const ed = { nombre: c.nombre, telefono: c.telefono }; // lo escrito (sin tocar el cliente hasta guardar)
  const filaVeh = (v, i, nuevo = false) => {
    const u = nuevo ? null : usoVehiculo(v.id);
    return `<div class="cli-veh-ed" data-i="${i}" data-nuevo="${nuevo ? 1 : 0}">
      <div class="grid">
        <label>Marca *<input data-f="marca" value="${esc(v.marca || '')}" list="lista-marcas"></label>
        <label>Modelo *<input data-f="modelo" value="${esc(v.modelo || '')}"></label>
        <label>Placa *<input data-f="placa" class="upper" value="${esc(v.placa || '')}"></label>
        <label>Año<input data-f="anio" value="${esc(v.anio || '')}" inputmode="numeric" maxlength="4"></label>
        <label>Color<input data-f="color" value="${esc(v.color || '')}"></label>
      </div>
      <div class="cli-veh-pie"><small class="hint">${nuevo ? 'Vehículo nuevo' : esc(textoUso(u)) || 'Sin historial'}</small>
        <button type="button" class="btn tiny ghost" data-cle="quitar-veh">Quitar vehículo</button></div>
    </div>`;
  };
  const pintar = () => {
    abrirModal(`
      <h3>Editar cliente</h3>
      <div class="grid">
        <label>Nombre *<input id="cle-nombre" value="${esc(ed.nombre)}"></label>
        <label>Teléfono *<input id="cle-telefono" value="${esc(ed.telefono)}" inputmode="tel"></label>
      </div>
      <h4 class="subtitulo">Vehículos</h4>
      <div id="cle-vehs">${vs.map((v, i) => filaVeh(v, i)).join('')}${nuevos.map((v, i) => filaVeh(v, i, true)).join('')}</div>
      <button type="button" class="btn small ghost" data-cle="agregar-veh">+ Agregar vehículo</button>
      <details class="cli-unir">
        <summary>Unir con otro cliente (clientes duplicados)</summary>
        <p class="hint">Mueve todos los vehículos de <strong>${esc(c.nombre)}</strong> (con su historial) al cliente que elijas, y luego elimina este registro duplicado.</p>
        <input id="cle-unir-buscar" type="search" placeholder="Buscar el cliente correcto por nombre, teléfono o placa…" autocomplete="off">
        <div id="cle-unir-res" class="picker-list"></div>
      </details>
      <div class="actions" style="margin-top:12px">
        <button type="button" class="btn ghost" data-act="cerrar">Cancelar</button>
        <button type="button" class="btn primary" data-cle="guardar">Guardar</button>
      </div>`);
  };
  const leer = () => {
    $$('#cle-vehs .cli-veh-ed').forEach((row) => {
      const arr = row.dataset.nuevo === '1' ? nuevos : vs;
      const v = arr[Number(row.dataset.i)]; if (!v) return;
      row.querySelectorAll('[data-f]').forEach((i) => (v[i.dataset.f] = i.value.trim()));
    });
    ed.nombre = $('#cle-nombre').value.trim(); ed.telefono = $('#cle-telefono').value.trim();
  };
  pintar();
  const quitados = new Set();
  $('#modal-body').onclick = async (e) => {
    const b = e.target.closest('[data-cle]');
    const pick = e.target.closest('[data-unir]');
    if (pick) { await unirClientes(cid, pick.dataset.unir); return; }
    if (!b) return;
    if (b.dataset.cle === 'agregar-veh') { leer(); nuevos.push({ marca: '', modelo: '', placa: '', anio: '', color: '' }); pintar(); $$('#cle-vehs .cli-veh-ed').at(-1)?.querySelector('input')?.focus(); return; }
    if (b.dataset.cle === 'quitar-veh') {
      leer();
      const row = b.closest('.cli-veh-ed'); const i = Number(row.dataset.i);
      if (row.dataset.nuevo === '1') { nuevos.splice(i, 1); pintar(); return; }
      const v = vs[i]; const u = usoVehiculo(v.id);
      if (totalUso(u)) { avisar(`No se puede quitar ${v.marca} ${v.modelo} (${v.placa}) porque tiene historial: ${textoUso(u)}.\nSi pertenece a otro cliente, usa «Unir con otro cliente» o corrige los datos.`); return; }
      if (!await confirmar(`¿Quitar el vehículo ${v.marca} ${v.modelo} (${v.placa})? No tiene historial.`)) { pintar(); return; }
      quitados.add(v.id); vs.splice(i, 1); pintar(); return;
    }
    if (b.dataset.cle === 'guardar') {
      leer();
      if (!ed.nombre) { alert('Escribe el nombre del cliente.'); return; }
      if (soloDigitos(ed.telefono).length < 10) { alert('Revisa el teléfono: debe tener al menos 10 dígitos.'); return; }
      const todos = [...vs, ...nuevos];
      for (const v of todos) {
        if (!v.marca || !v.modelo || !v.placa) { alert('Cada vehículo necesita marca, modelo y placa.'); return; }
        v.placa = v.placa.toUpperCase().replace(/\s+/g, '');
        const otro = db.vehiculos.find((x) => x.placa === v.placa && x.id !== v.id && !quitados.has(x.id));
        if (otro) { alert(`La placa ${v.placa} ya pertenece a otro vehículo (${otro.marca} ${otro.modelo} de ${cliente(otro.clienteId)?.nombre || 'otro cliente'}).`); return; }
      }
      if (new Set(todos.map((v) => v.placa)).size !== todos.length) { alert('Hay dos vehículos con la misma placa.'); return; }
      Object.assign(c, { nombre: ed.nombre, telefono: ed.telefono });
      vs.forEach((v) => { const g = vehiculo(v.id); if (g) Object.assign(g, { marca: v.marca, modelo: v.modelo, placa: v.placa, anio: v.anio, color: v.color }); });
      nuevos.forEach((v) => db.vehiculos.push({ id: uid(), clienteId: cid, marca: v.marca, modelo: v.modelo, placa: v.placa, anio: v.anio, color: v.color, creado: new Date().toISOString() }));
      db.vehiculos = db.vehiculos.filter((v) => !quitados.has(v.id));
      await guardar();
      toast('Cliente actualizado');
      verCliente(cid);
    }
  };
  $('#modal-body').oninput = (e) => {
    if (e.target.id !== 'cle-unir-buscar') return;
    const q = norm(e.target.value).trim();
    const lista = !q ? [] : db.clientes.filter((x) => x.id !== cid && norm([x.nombre, x.telefono, ...vehiculosDe(x.id).map((v) => v.placa)].join(' ')).includes(q)).slice(0, 6);
    $('#cle-unir-res').innerHTML = lista.map((x) => `<div class="resultado" data-unir="${x.id}"><div><strong>${esc(x.nombre)}</strong> <small>${esc(x.telefono)}</small><br><small>${vehiculosDe(x.id).map((v) => esc(`${v.marca} ${v.modelo} · ${v.placa}`)).join(' / ') || 'Sin vehículos'}</small></div><strong>Unir aquí</strong></div>`).join('') || (q ? '<p class="hint">No se encontró otro cliente.</p>' : '');
  };
}

// Mueve los vehículos de "origen" al cliente "destino" y elimina el registro duplicado
async function unirClientes(origen, destino) {
  const a = cliente(origen); const b = cliente(destino); if (!a || !b) return;
  const vs = vehiculosDe(origen);
  if (!await confirmar(`¿Unir «${a.nombre}» con «${b.nombre}» (${b.telefono})?\n\nLos ${vs.length} vehículo(s) de «${a.nombre}» pasarán a «${b.nombre}» con todo su historial, y el registro «${a.nombre}» se eliminará.`, { titulo: 'Unir clientes', si: 'Unir clientes' })) return;
  vs.forEach((v) => (v.clienteId = destino));
  db.clientes = db.clientes.filter((c) => c.id !== origen);
  await guardar();
  toast(`Clientes unidos: ahora todo está en «${b.nombre}»`);
  verCliente(destino);
}

async function eliminarCliente(cid) {
  const c = cliente(cid); if (!c) return;
  const vs = vehiculosDe(cid);
  const uso = vs.map((v) => usoVehiculo(v.id)).reduce((acc, u) => { Object.keys(u).forEach((k) => (acc[k] = (acc[k] || 0) + u[k])); return acc; }, {});
  if (totalUso(uso)) {
    avisar(`No se puede eliminar a «${c.nombre}» porque sus vehículos tienen historial: ${textoUso(uso)}.\n\nPara no perder trabajos registrados, corrige sus datos con «Editar» o, si está duplicado, usa «Unir con otro cliente».`, { titulo: 'No se puede eliminar' });
    return;
  }
  if (!await confirmar(`¿Eliminar a «${c.nombre}»${vs.length ? ` y su(s) ${vs.length} vehículo(s)` : ''}? No tiene historial registrado. Esto no se puede deshacer.`, { titulo: 'Eliminar cliente', si: 'Eliminar', peligro: true })) return;
  const ids = new Set(vs.map((v) => v.id));
  db.vehiculos = db.vehiculos.filter((v) => !ids.has(v.id));
  db.clientes = db.clientes.filter((x) => x.id !== cid);
  await guardar();
  cerrarModal();
  toast('Cliente eliminado');
}

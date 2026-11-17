/* Jacks4WD – Póliza de garantías (datos compartidos)
 * La usan la app (Configuración → Garantías) y la página pública garantias.html.
 * POLIZA_INICIAL es el texto original; lo que el administrador guarde en la
 * configuración ("garantias") la reemplaza.
 */
const TIEMPOS_GARANTIA = ['3 meses', '6 meses', '1 año', '2 años', '3 años', 'De por vida'];

const POLIZA_INICIAL = {
  intro: 'La garantía se cuenta a partir de la fecha de entrega del vehículo indicada en la nota de entrega.',
  marcas: {
    titulo: 'Tiempo de garantía según la marca del repuesto',
    nota: '',
    filas: [
      { nombre: 'Bilstein', tiempo: '2 años' }, { nombre: 'Febi', tiempo: '2 años' }, { nombre: 'Blue Print', tiempo: '2 años' },
      { nombre: 'Moog', tiempo: '2 años' }, { nombre: 'Wagner', tiempo: '2 años' }, { nombre: 'Old Man Emu', tiempo: '2 años' },
      { nombre: 'TJM', tiempo: '2 años' }, { nombre: 'Dobinsons', tiempo: '2 años' }, { nombre: '555', tiempo: '2 años' },
      { nombre: 'Joint Fuji', tiempo: '2 años' },
      { nombre: 'Toyota (original)', tiempo: '1 año' }, { nombre: 'Aisin', tiempo: '1 año' }, { nombre: 'Denso', tiempo: '1 año' },
      { nombre: 'Okami', tiempo: '1 año' }, { nombre: 'Proshock', tiempo: '1 año' }, { nombre: 'Jinbo', tiempo: '1 año' },
    ],
  },
  electricas: {
    titulo: 'Piezas eléctricas con garantía',
    nota: 'Solo las siguientes piezas eléctricas cuentan con garantía:',
    filas: [
      { nombre: 'Módulos de bomba de gasolina Toyota', tiempo: '1 año' },
      { nombre: 'Bombas de gasolina Hella o Yukkazzo', tiempo: '1 año' },
      { nombre: 'Bombillos Wellstar', tiempo: 'De por vida' },
    ],
  },
  manoObra: {
    titulo: 'Garantía de mano de obra',
    texto: 'Todos nuestros trabajos de mano de obra tienen garantía. Si se presenta una falla causada por nuestro trabajo, JACKS4WD asume los gastos de traslado del vehículo, la reparación y los repuestos que resulten dañados por esa falla.',
  },
  condiciones: {
    titulo: 'Condiciones para aplicar la garantía',
    nota: 'La pieza será evaluada en nuestro taller. La garantía aplica cuando se cumplen estas condiciones:',
    filas: [
      { nombre: 'Amortiguadores', texto: 'Sin marcas visibles en el vástago, sin dobladuras ni roturas por impacto, sin señales de mala instalación y sin adaptaciones.' },
      { nombre: 'Piezas de tren delantero', texto: 'Sin dobladuras ni roturas por impacto, sin señales de falta de mantenimiento (cuando el caso lo permita o lo amerite) y sin daños causados por fugas de aceite u otros fluidos que provoquen un desgaste prematuro de la pieza.' },
      { nombre: 'Piezas eléctricas', texto: 'Sin señales visibles de daños por fuego, agua o quemaduras por cortocircuitos.' },
    ],
  },
  exclusiones: {
    titulo: 'La garantía no aplica en estos casos',
    items: [
      'Si la pieza fue manipulada por el cliente o por un taller distinto a JACKS4WD.',
      'Si la pieza fue diagnosticada por un taller distinto a JACKS4WD o a sus técnicos certificados.',
      'Piezas usadas en condiciones extremas o deportivas (competencias 4x4, carreras, piques, etc.).',
    ],
  },
  validar: {
    titulo: 'Cómo hacer válida tu garantía',
    items: [
      'Comunícate con nosotros apenas notes la falla y no sigas usando la pieza si eso puede empeorar el daño.',
      'Presenta tu número de nota de entrega o el historial de tu vehículo.',
      'Trae el vehículo a nuestro taller para el diagnóstico de la pieza.',
    ],
  },
};

// Valida y limpia una póliza (lo que venga de la nube, de un archivo o del editor).
// Los logos solo se aceptan como imágenes incrustadas (data:image/...).
function limpiarPoliza(p) {
  const base = POLIZA_INICIAL;
  const o = p && typeof p === 'object' ? p : {};
  const txt = (v, max = 300) => String(v ?? '').slice(0, max);
  const LOGO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const logo = (v) => (typeof v === 'string' && v.length < 400000 && LOGO.test(v) ? v : '');
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const bloque = (b, d) => (b && typeof b === 'object' ? b : d);
  const filasTiempo = (b, d) => ({
    titulo: txt(bloque(b, d).titulo ?? d.titulo, 120), nota: txt(bloque(b, d).nota ?? '', 500),
    filas: lista(bloque(b, d).filas).slice(0, 80).map((f) => ({ nombre: txt(f.nombre, 120), tiempo: txt(f.tiempo, 40), logo: logo(f.logo) })).filter((f) => f.nombre),
  });
  const items = (b, d) => ({
    titulo: txt(bloque(b, d).titulo ?? d.titulo, 120),
    items: (Array.isArray(bloque(b, d).items) ? bloque(b, d).items : []).map((x) => txt(x, 600)).filter((x) => x.trim()).slice(0, 40),
  });
  const mo = bloque(o.manoObra, base.manoObra);
  const co = bloque(o.condiciones, base.condiciones);
  return {
    intro: txt(o.intro ?? base.intro, 600),
    marcas: filasTiempo(o.marcas, base.marcas),
    electricas: filasTiempo(o.electricas, base.electricas),
    manoObra: { titulo: txt(mo.titulo ?? base.manoObra.titulo, 120), texto: txt(mo.texto ?? '', 2000) },
    condiciones: {
      titulo: txt(co.titulo ?? base.condiciones.titulo, 120), nota: txt(co.nota ?? '', 500),
      filas: lista(co.filas).slice(0, 40).map((f) => ({ nombre: txt(f.nombre, 120), texto: txt(f.texto, 1000) })).filter((f) => f.nombre || f.texto),
    },
    exclusiones: items(o.exclusiones, base.exclusiones),
    validar: items(o.validar, base.validar),
  };
}

/* Jacks4WD – Fotos predeterminadas de los aceites del catálogo (img/aceites/).
 * Las usan la app y la página pública del historial (historial.html).
 * Si el administrador agregó una foto propia en el catálogo, esa tiene prioridad.
 */
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
function fotoPredeterminadaAceite(marca, linea, viscosidad) {
  const n = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  const archivo = FOTOS_PREDETERMINADAS[[marca, linea, viscosidad].map(n).join('|')];
  return archivo ? 'img/aceites/' + archivo : '';
}

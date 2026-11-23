/* Jacks4WD – Conexión con la base de datos en la nube (Supabase).
 * Esta clave es la "publishable key": está pensada para ir dentro de la página.
 * La seguridad la aplican las reglas del servidor (supabase/esquema.sql).
 * NUNCA pongas aquí la clave secreta (sb_secret_… / service_role).
 * Si dejas "url" vacío, la app vuelve a funcionar solo en esta computadora.
 */
const NUBE_CONFIG = {
  url: 'https://zdbajipgoultgcrxizyn.supabase.co',
  clave: 'sb_publishable_yQgTIx4Z6VA30h3VEaTaOA_0nJd-wvs',
  dominioUsuarios: 'jacks4wd.app', // "admin" → admin@jacks4wd.app
  segundosActualizacion: 30,       // cada cuánto se traen los cambios de otros dispositivos
  minutosInactividad: 30,          // la sesión se cierra sola tras este tiempo sin uso
  urlPublica: 'https://app.jacks4wd.com/', // dirección pública (garantías, historial del cliente)
};

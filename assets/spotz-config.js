/* ============================================================================
 * spotz-config.js — configuración compartida del front de la landing.
 *
 * Antes esto estaba copiado a mano en index.html, comercios.html, api/event.js
 * y api/delete-account.js. Con el mapa y las fichas de local serían siete
 * copias, y ahí deja de ser deuda tolerable.
 *
 * Las dos claves de Supabase son PÚBLICAS por diseño: viajan en el bundle de
 * las apps y están protegidas por RLS. El token de Mapbox también, y por eso
 * está restringido por URL en account.mapbox.com.
 * ========================================================================== */

window.SPOTZ = {
  SUPABASE_URL: 'https://yifijgmmrdpafmeknind.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmlqZ21tcmRwYWZtZWtuaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTAyNjksImV4cCI6MjA5MTUyNjI2OX0.YMvZAX8BD8h8EHZHuG4H9HR17REkaW9awnZPY4WYtG4',

  /* El token de Mapbox NO vive aquí: lo sirve /api/mapbox-token desde las
   * variables de entorno de Vercel (MAPBOX_TOKEN).
   *
   * Motivo: el escaneo de secretos de GitHub bloquea el push si aparece un
   * token de Mapbox en el repo. De paso se gana poder rotarlo sin commit.
   *
   * Debe ser un token DISTINTO al de la app: las restricciones por URL de
   * Mapbox se evalúan por cabecera `Referer`, y el SDK nativo no la manda, así
   * que restringir EXPO_PUBLIC_MAPBOX_TOKEN rompería el mapa del móvil. */

  /* Las DOS constantes de las que sale todo lo demás: el cronómetro del hero,
   * el chip "Día N de 45" y el del tablero. Nunca escribir un número a mano —
   * es lo que garantiza que la web diga lo mismo que el video de ese día. */
  START:  '2026-08-25T00:00:00-04:00',   // Día 1 — sale el primer video
  LAUNCH: '2026-10-09T00:00:00-04:00',   // el lanzamiento

  /** Meta de socios de la serie. */
  PARTNER_GOAL: 20,

  /** Meta de la lista de espera (marco de escasez del formulario). */
  WAITLIST_GOAL: 500,
}

/** Días totales de la serie: 45. Se calcula, no se escribe. */
window.SPOTZ.TOTAL_DAYS = Math.round(
  (new Date(window.SPOTZ.LAUNCH) - new Date(window.SPOTZ.START)) / 86400000
)

/**
 * Estado del cronómetro. `day` es el día de la serie que se está viviendo
 * (1 el día del primer video), `daysLeft` lo que falta para lanzar.
 */
window.SPOTZ.countdown = function countdown(now) {
  const n = now || new Date()
  const launch = new Date(window.SPOTZ.LAUNCH)
  const start = new Date(window.SPOTZ.START)

  const ms = Math.max(0, launch - n)
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)

  const day = Math.min(
    window.SPOTZ.TOTAL_DAYS,
    Math.max(1, Math.floor((n - start) / 86400000) + 1)
  )

  return { days, hours, minutes, seconds, day, total: window.SPOTZ.TOTAL_DAYS, launched: ms === 0 }
}

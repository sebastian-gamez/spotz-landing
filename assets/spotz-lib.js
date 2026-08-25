/* ============================================================================
 * spotz-lib.js — ESPEJO de lógica que vive en el monorepo.
 *
 * ⚠️ ESTO ES DUPLICACIÓN DELIBERADA. La landing no tiene bundler (esa es su
 * virtud: cero build, cero package.json), así que no puede importar TypeScript.
 * Cada bloque de aquí es una traducción 1:1 de un archivo del monorepo.
 *
 *   resolveCardDesign / shade / gradientForVenue  ← shared/lib/card-design.ts
 *   formatDateTime y amigos                       ← Spotz/lib/date.ts
 *   isEventAvailable / isOpenNow                  ← Spotz/lib/availability.ts
 *   formatPrice                                   ← Spotz/components/events/event-card.tsx:21
 *
 * SI CAMBIAS UNO, CAMBIA EL OTRO. Si no, la tarjeta de la web y la de la app
 * divergen en silencio, que es exactamente lo que `card-design.ts` existe para
 * impedir.
 * ========================================================================== */

/* ─── Paleta ── espejo de Spotz/constants/theme.ts ────────────────────────── */
const PALETTE = {
  bg: '#0D1B2A', bar: '#12212F', raised: '#16283C',
  surface: '#1B2E45', surface2: '#243A54', border: '#31495F',
  text: '#FFFFFF', textMuted: '#A7B4C2', textFaint: '#7E8C9E',
  accent: '#FF6B35', accentDeep: '#B8420F', accentText: '#FFB694',
  onAccent: '#FFFFFF',
  success: '#22C55E', warning: '#F59E0B', danger: '#EF4444',
}

/* ─── card-design.ts ──────────────────────────────────────────────────────── */

const DEFAULT_ACCENT = '#FF6B35'

/** Gradiente determinista por nombre: mismo venue → mismo color estable. */
function gradientForVenue(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return [`hsl(${h}, 42%, 22%)`, `hsl(${(h + 38) % 360}, 55%, 34%)`]
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Aclara (amount>0) u oscurece (amount<0) un hex; amount en [-1, 1]. */
function shade(hex, amount) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const target = amount < 0 ? 0 : 255
  const p = Math.min(Math.abs(amount), 1)
  const mix = (c) => Math.round((target - c) * p + c)
  const to2 = (c) => mix(c).toString(16).padStart(2, '0')
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`
}

/** ¿El color es claro? Solo hex; el fallback HSL es oscuro (L=22%). */
function isLight(color) {
  const rgb = hexToRgb(color)
  if (!rgb) return false
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.62
}

/** Resuelve el tema de una tarjeta a partir de su `design` (o defaults). */
function resolveCardDesign(venueName, design) {
  const d = design || {}

  let bg, bg2, isGradient
  if (d.bg) {
    bg = d.bg
    isGradient = !!d.gradient
    bg2 = isGradient ? shade(d.bg, -0.22) : d.bg
  } else {
    const g = gradientForVenue(venueName || 'Spotz')
    bg = g[0]; bg2 = g[1]; isGradient = true
  }

  const darkText = d.text ? d.text === 'dark' : isLight(bg)
  const accent = d.accent || DEFAULT_ACCENT

  return {
    bg, bg2, isGradient,
    accent,
    onAccent:  isLight(accent) ? '#0D1B2A' : '#FFFFFF',
    textColor: darkText ? '#0D1B2A' : '#FFFFFF',
    textMuted: darkText ? 'rgba(13,27,42,0.60)' : 'rgba(255,255,255,0.72)',
    logoUrl:   d.logoUrl || null,
  }
}

/** El equivalente web del <LinearGradient start={0,0} end={1,1}> de la app. */
function cardBackground(d) {
  return d.isGradient ? `linear-gradient(135deg, ${d.bg}, ${d.bg2})` : d.bg
}

/** Iniciales del venue cuando no hay logo — espejo de cupones.tsx:108. */
function initialsOf(name) {
  return String(name || '')
    .trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase()).join('') || 'S'
}

/* ─── date.ts ─────────────────────────────────────────────────────────────── */

const LOCALE = 'es-VE'

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Hoy · 8:30 PM" / "Mañana · …" / "sáb 22 ago · …". Separador U+00B7. */
function formatDateTime(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const time = formatTime(iso)
  if (isSameDay(d, now))      return `Hoy · ${time}`
  if (isSameDay(d, tomorrow)) return `Mañana · ${time}`
  return `${formatShortDate(iso)} · ${time}`
}

/* ─── event-card.tsx:21 — formatPrice ─────────────────────────────────────── */
/* Ojo: el separador es guion largo U+2013 con espacios, no un guion normal. */
function formatPrice(ev) {
  if (ev.is_free) return 'Gratis'
  if (!ev.price_from) return ''
  if (ev.price_from === ev.price_to) return `$${ev.price_from}`
  return `$${ev.price_from} – $${ev.price_to}`
}

/* ─── availability.ts ─────────────────────────────────────────────────────── */
/* Filosofía declarada en el original: sin datos → DISPONIBLE. Nunca ocultar un
 * local porque falte información. */

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/* El original usa caracteres combinantes LITERALES en este regex, y un
 * copy-paste que normalice el archivo lo rompe en silencio: `miércoles` deja de
 * hacer match y el local sale cerrado los miércoles. Aquí van escapados. */
function normalize(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Rangos [inicioMin, finMin] de un día, desde el formato de Google Places. */
function rangesForDay(openingHours, dayName) {
  if (!Array.isArray(openingHours)) return []
  const target = normalize(dayName)
  const line = openingHours.find((l) => normalize(l).startsWith(target))
  if (!line) return []

  const norm = normalize(line)
  if (norm.includes('cerrado') || norm.includes('closed')) return []
  if (norm.includes('24 horas') || norm.includes('24 hours') || norm.includes('todo el dia')) {
    return [[0, 1440]]
  }

  const colon = line.indexOf(':')
  const body = colon === -1 ? line : line.slice(colon + 1)
  const tokens = body.match(/(\d{1,2}):(\d{2})/g)
  if (!tokens || tokens.length < 2) return []

  const mins = tokens.map((t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })

  const out = []
  for (let i = 0; i + 1 < mins.length; i += 2) out.push([mins[i], mins[i + 1]])
  return out
}

function isOpenNow(openingHours, now) {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return true
  const d = now || new Date()
  const nowMin = d.getHours() * 60 + d.getMinutes()

  for (const [start, end] of rangesForDay(openingHours, DAY_NAMES[d.getDay()])) {
    if (end > start) { if (nowMin >= start && nowMin < end) return true }
    else if (nowMin >= start) return true          // cruza medianoche
  }

  // El rango de AYER que cruzó medianoche: cubre las madrugadas.
  const yesterday = DAY_NAMES[(d.getDay() + 6) % 7]
  for (const [start, end] of rangesForDay(openingHours, yesterday)) {
    if (end <= start && nowMin < end) return true
  }

  return false
}

/** 'scheduled' → solo antes de empezar. 'recurring' → según el horario. */
function isEventAvailable(ev, now) {
  const d = now || new Date()
  if (ev.availability_type === 'scheduled') {
    const start = new Date(ev.start_time).getTime()
    return Number.isFinite(start) ? start > d.getTime() : true
  }
  return isOpenNow(ev.opening_hours, d)
}

/* ─── Export: sirve a los DOS lados ────────────────────────────────────────
 * En el navegador la landing lo carga con <script> y lo usa como window.SpotzLib.
 * En Vercel, api/local.js hace require('../assets/spotz-lib.js') para pintar la
 * tarjeta del cupón en el servidor.
 *
 * Es deliberado que sea el MISMO archivo: si el servidor tuviera su propia copia
 * de resolveCardDesign, habría TRES versiones de la misma lógica (el TS original,
 * esta y la del servidor) y la tarjeta acabaría viéndose distinta según por dónde
 * la mires. Ya son dos; tres es donde se rompe. */
var SpotzLibAPI = {
  PALETTE,
  resolveCardDesign, cardBackground, gradientForVenue, shade, initialsOf,
  formatDateTime, formatTime, formatShortDate, formatPrice,
  isEventAvailable, isOpenNow,
}

if (typeof window !== 'undefined') window.SpotzLib = SpotzLibAPI
if (typeof module !== 'undefined' && module.exports) module.exports = SpotzLibAPI

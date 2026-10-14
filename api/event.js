// Página pública de un evento — se sirve en https://enspotz.com/event/:id
// (la app comparte ese link). Renderiza la info del evento con meta tags Open
// Graph para que la vista previa al compartir (WhatsApp, IG, X…) muestre título
// e imagen, e incluye un banner para descargar la app.
//
// Es una función serverless de Vercel (zero-config: cualquier archivo en /api).
// Usa fetch nativo (Node 18+) contra la REST API de Supabase con la anon key
// pública (la misma que ya usa index.html; protegida por RLS).

const SUPABASE_URL = 'https://yifijgmmrdpafmeknind.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmlqZ21tcmRwYWZtZWtuaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTAyNjksImV4cCI6MjA5MTUyNjI2OX0.YMvZAX8BD8h8EHZHuG4H9HR17REkaW9awnZPY4WYtG4'

// Links de descarga. Mientras la app no esté en las tiendas apuntan al home
// (lista de espera). Actualizar cuando estén publicadas.
const HOME_URL = 'https://enspotz.com'
// La app de usuario vive en enspotz.com/app (la landing la proxea; ver vercel.json).
const APP_URL = HOME_URL + '/app'

const ORANGE = '#FF6B35'
const INK = '#0D1B2A'
const INK2 = '#111D2C'

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatDate(iso) {
  try {
    const d = new Date(iso)
    const s = d.toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
    })
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch {
    return ''
  }
}

// Copia de `shared/lib/price.ts` del monorepo (variante 'detail'). Un precio puede ser real, estimado
// por rubro (price_source = 'estimado', SIEMPRE con su marca) o una etiqueta sin cifra (price_label).
const PRICE_LABELS = { segun_funcion: 'Según función', consultar_entrada: 'Consultar entrada', consultar: 'Consultar' }
function priceNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
function money(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') }
function priceLabel(ev) {
  if (ev.price_label === 'sin_linea') return ''
  if (ev.is_free) return ev.price_label === 'entrada_libre' ? 'Entrada libre' : 'Gratis'
  const from = priceNum(ev.price_from)
  if (from !== null) {
    const t = priceNum(ev.price_to)
    const to = t !== null && t > from ? t : null
    const cifra = to === null ? `$${money(from)}` : `$${money(from)}–${money(to)}`
    if (ev.price_source === 'estimado') return `≈ ${cifra} USD · estimado`
    return to === null && t !== from ? `Desde ${cifra} USD` : `${cifra} USD`
  }
  if (PRICE_LABELS[ev.price_label]) return PRICE_LABELS[ev.price_label]
  return 'Por confirmar'
}
function priceNote(ev) {
  const e = ev.price_evidence || {}
  if (ev.price_source === 'estimado' && priceNum(ev.price_from) !== null) {
    return `${e.etiqueta ? `Típico de ${e.etiqueta}` : 'Rango típico de locales parecidos'} en Caracas. Confírmalo con el local.`
  }
  if (ev.price_label === 'segun_funcion') return 'Cambia con cada función: mira su cartelera.'
  return ''
}

// Variante pequeña de una imagen ya comprimida (-1200.webp → -400.webp). Espejo de
// `small()` en api/local.js y de `thumb()` en shared/image-url.ts del monorepo: las
// fotos migradas existen en los dos tamaños. Cualquier otra URL se deja igual.
function small(url) {
  return typeof url === 'string' ? url.replace(/-1200\.webp(\?|$)/, '-400.webp$1') : url
}

// Misma foto aunque cambie la query o el hash (p. ej. un cache-buster).
function sameImage(a, b) {
  return String(a || '').split(/[?#]/)[0] === String(b || '').split(/[?#]/)[0]
}

// Fotos de la ficha: la portada primero y, detrás, hasta 3 de `event_media`
// (solo imágenes, por `position`), sin repetir la portada. Igual que la app
// (components/events/event-media-carousel.tsx), donde la portada es la posición 0.
function photosOf(event) {
  const out = []
  if (event.cover_image_url) out.push(event.cover_image_url)
  const media = Array.isArray(event.media) ? event.media : []
  media
    .filter(m => m && m.url && (m.type === 'image' || !m.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(0, 3)
    .forEach(m => { if (!out.some(u => sameImage(u, m.url))) out.push(m.url) })
  return out
}

function igHandle(raw) {
  const h = String(raw).trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '').replace(/\/+$/, '')
  return '@' + h
}
function igUrl(raw) {
  const h = String(raw).trim()
  if (/^https?:\/\//i.test(h)) return h
  return 'https://instagram.com/' + h.replace(/^@/, '')
}
function waUrl(raw) {
  return 'https://wa.me/' + String(raw).replace(/[^0-9]/g, '')
}

// SVG del rayo (favicon + logo). Naranja para fondos oscuros (topbar);
// blanco para el banner de descarga (fondo naranja).
const BOLT = '<svg width="22" height="22" viewBox="0 0 80 80" fill="none"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>'
const BOLT_WHITE = '<svg width="22" height="22" viewBox="0 0 80 80" fill="none"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="#fff"/></svg>'
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>')

// Los dos botones llevan utm_source=share: quien entra a la app desde una ficha
// compartida queda atribuido a "compartido" si no traía ya un primer contacto
// (attribution.js lo guarda antes; la app no lo pisa).
const UTM_FICHA = 'utm_source=share&utm_medium=event'
function conUtm(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + UTM_FICHA }

// `appUrl`: adónde lleva "Abrir en Spotz" (la ficha de este evento dentro de la
// app, o la app a secas si no hay evento).
function downloadBanner(appUrl) {
  return `
    <section class="dl">
      <div class="dl-logo">${BOLT_WHITE}<span class="wm">Spotz</span></div>
      <h2 class="dl-title">Descubre todos los planes de Caracas</h2>
      <p class="dl-sub">Eventos, conciertos y experiencias en un solo lugar. Recomendaciones con IA según tus gustos.</p>
      <div class="dl-btns">
        <a class="store" href="${esc(conUtm(appUrl || APP_URL))}">Abrir en Spotz →</a>
        <a class="store store-alt" href="${esc(conUtm(APP_URL))}">Ver todos los planes</a>
      </div>
      <p class="dl-note">Gratis, desde el navegador. Pronto en App Store y Google Play.</p>
    </section>`
}

// Una foto por `<picture>`: en móvil (< 600 px) el navegador pide la -400.webp y solo
// en pantallas anchas la -1200.webp. Es media query de viewport, no de densidad, a
// propósito: cuida el egress de Supabase (la ficha se abre casi siempre desde WhatsApp).
// Solo la primera carga con prioridad; el resto, perezosas.
function photoTag(url, alt, index) {
  const first = index === 0
  const big = esc(url)
  const sm = esc(small(url))
  const source = sm !== big ? `<source media="(min-width: 600px)" srcset="${big}">` : ''
  return `<picture class="slide">${source}<img src="${sm}" width="1200" height="750" alt="${esc(alt)}"` +
    (first ? ' loading="eager" fetchpriority="high"' : ' loading="lazy" decoding="async"') + '></picture>'
}

// Galería de la ficha. Con una sola foto es el héroe de siempre; con varias, un
// carrusel SOLO con CSS (scroll-snap) y puntos indicadores. Sin JavaScript: la CSP de
// vercel.json no permite scripts en línea. El punto activo se mueve con la posición
// del carrusel vía scroll-timeline (Chrome/Edge); donde no hay soporte queda estático
// sobre la primera foto, que sigue siendo una señal honesta de "hay más fotos".
function gallery(photos, title) {
  if (!photos.length) return ''
  if (photos.length === 1) return `<div class="hero">${photoTag(photos[0], title, 0)}</div>`
  const n = photos.length
  const slides = photos.map((u, i) => photoTag(u, `${title} · foto ${i + 1} de ${n}`, i)).join('')
  const dots = '<i></i>'.repeat(n)
  return `
    <section class="gal" aria-roledescription="carrusel" aria-label="${esc(`Fotos de ${title}`)}">
      <div class="gal-track" tabindex="0" role="region" aria-label="${esc(`${n} fotos, desliza para ver más`)}">${slides}</div>
      <div class="gal-dots" style="--n:${n}" aria-hidden="true">${dots}</div>
    </section>`
}

function pageShell({ title, desc, image, url, body, app }) {
  const ogImage = image ? `<meta property="og:image" content="${esc(image)}">
  <meta name="twitter:image" content="${esc(image)}">` : ''
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="icon" href="${FAVICON}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Spotz">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(url)}">
  ${ogImage}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    body {
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
      background:${INK}; color:#fff; line-height:1.5;
    }
    .wrap { max-width:560px; margin:0 auto; padding-bottom:48px; }
    .topbar { display:flex; align-items:center; gap:8px; padding:18px 20px; }
    .topbar .wm { font-weight:900; font-size:18px; letter-spacing:-0.02em; }
    .hero, .gal { position:relative; width:100%; max-width:100%; background:${INK2}; overflow:hidden; }
    .slide { display:block; flex:0 0 100%; width:100%; min-width:0; scroll-snap-align:start; scroll-snap-stop:always; }
    .slide img { display:block; width:100%; height:auto; aspect-ratio:16/10; object-fit:cover; background:${INK2}; }
    .gal { timeline-scope:--gal; }
    .gal-track { display:flex; overflow-x:auto; overflow-y:hidden; scroll-snap-type:x mandatory;
                 scroll-timeline:--gal x; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch;
                 scrollbar-width:none; outline:none; }
    .gal-track::-webkit-scrollbar { display:none; }
    .gal-track:focus-visible { box-shadow:inset 0 0 0 2px ${ORANGE}; }
    .gal-dots { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); display:flex; gap:6px;
                padding:6px 8px; border-radius:999px; background:rgba(13,27,42,.45); pointer-events:none; }
    .gal-dots i { display:block; width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.4); }
    .gal-dots::after { content:''; position:absolute; left:8px; top:6px; width:6px; height:6px; border-radius:50%; background:#fff; }
    /* Solo donde hay scroll-driven animations: fuera del @supports la animación correría
       por tiempo y dejaría el punto activo clavado en el último. */
    @supports (animation-timeline: scroll()) {
      .gal-dots::after { animation:gal-dot 1s linear both; animation-timeline:--gal; }
    }
    @keyframes gal-dot { to { transform:translateX(calc((var(--n) - 1) * 12px)); } }
    .content { padding:24px 20px; }
    .cat { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase;
           letter-spacing:0.06em; color:${ORANGE}; margin-bottom:10px; }
    h1 { font-size:26px; font-weight:800; line-height:1.2; letter-spacing:-0.02em; margin-bottom:16px; }
    .meta { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
    .meta-row { display:flex; align-items:flex-start; gap:10px; font-size:15px; color:#E5E7EB; }
    .meta-row .ic { width:20px; text-align:center; }
    .meta-row .sub { color:#A7B4C2; font-size:13px; }
    .price { display:inline-block; font-size:16px; font-weight:800; color:${ORANGE};
             border:1px solid ${ORANGE}55; background:${ORANGE}14; padding:8px 14px;
             border-radius:12px; margin-bottom:22px; }
    .price-note { color:#A7B4C2; font-size:13px; margin:-12px 0 22px; }
    .desc { color:#C7D0DA; font-size:15px; line-height:1.7; white-space:pre-line; margin-bottom:24px; }
    .claim { margin-top:20px; padding:14px 16px; border:1px solid rgba(255,107,53,.35); border-radius:14px;
             font-size:14px; color:#C7D0DA; }
    .claim strong { color:#fff; }
    .claim a { display:inline-block; margin-top:8px; color:${ORANGE}; font-weight:700; text-decoration:none; }
    .contact { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
    .contact a { display:inline-flex; align-items:center; gap:7px; font-size:14px; font-weight:600;
                 color:#fff; text-decoration:none; padding:9px 14px; border-radius:12px;
                 border:1px solid rgba(255,255,255,0.12); background:${INK2}; }
    .dl { margin:28px 20px 0; padding:28px 22px; border-radius:24px;
          background:linear-gradient(160deg, ${ORANGE} 0%, #E85A28 100%); text-align:center; }
    .dl-logo { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:14px; }
    .dl-logo .wm { font-weight:900; font-size:20px; color:#fff; letter-spacing:-0.02em; }
    .dl-title { font-size:22px; font-weight:900; color:#fff; line-height:1.2; margin-bottom:8px; letter-spacing:-0.01em; }
    .dl-sub { color:rgba(255,255,255,0.85); font-size:14px; line-height:1.6; margin-bottom:20px; }
    .dl-btns { display:flex; flex-direction:column; gap:10px; max-width:320px; margin:0 auto; }
    .store { display:block; background:${INK}; color:#fff; font-weight:800; font-size:15px;
             padding:14px; border-radius:14px; text-decoration:none; }
    .store-alt { background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.35); }
    .dl-note { margin-top:14px; color:rgba(255,255,255,0.6); font-size:12px; }
    .foot { text-align:center; padding:28px 20px 8px; }
    .foot a { color:#7E8C9E; font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">${BOLT}<span class="wm">Spot<span style="color:${ORANGE}">z</span></span></div>
    ${body}
    ${downloadBanner(app)}
    <div class="foot"><a href="${HOME_URL}">enspotz.com · Eventos en Caracas</a></div>
  </div>
  <script src="/assets/spotz-config.js"></script>
  <script src="/assets/attribution.js" defer></script>
</body>
</html>`
}

function notFoundPage(url) {
  const body = `
    <div class="content">
      <h1>Evento no disponible</h1>
      <p class="desc">Este evento ya no está disponible o el enlace es incorrecto. Descubre todo lo que está pasando en Caracas en la app de Spotz.</p>
    </div>`
  return pageShell({
    title: 'Evento no disponible · Spotz',
    desc: 'Descubre todos los eventos y experiencias de Caracas en Spotz.',
    image: '', url, body,
  })
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || ''
  const canonical = `${HOME_URL}/event/${encodeURIComponent(id)}`

  if (!id) {
    res.statusCode = 302
    res.setHeader('Location', HOME_URL)
    return res.end()
  }

  let event = null
  try {
    // La galería va embebida en la misma petición (`media`), ya filtrada y acotada en el
    // servidor: solo imágenes, por `position`, máximo 3. RLS: event_media_public_read.
    const select = 'id,title,description,start_time,cover_image_url,is_free,price_from,price_to,' +
      'price_source,price_label,price_evidence,' +
      'venue:venues(id,name,address,instagram,whatsapp,merchant_id),category:categories(name),' +
      'media:event_media(url,type,position)'
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}` +
      '&media.type=eq.image&media.order=position.asc&media.limit=3&limit=1',
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    )
    if (r.ok) {
      const rows = await r.json()
      event = Array.isArray(rows) ? rows[0] : null
    }
  } catch {
    event = null
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (!event) {
    res.statusCode = 404
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.end(notFoundPage(canonical))
  }

  const venue = event.venue || null
  const cat = event.category || null
  const rawDesc = (event.description || '').trim()
  const ogDesc = rawDesc
    ? (rawDesc.length > 180 ? rawDesc.slice(0, 180).trimEnd() + '…' : rawDesc).replace(/\s+/g, ' ')
    : `${formatDate(event.start_time)}${venue ? ' · ' + venue.name : ''}`

  const contactLinks = []
  if (venue && venue.whatsapp) contactLinks.push(`<a href="${esc(waUrl(venue.whatsapp))}">WhatsApp</a>`)
  if (venue && venue.instagram) contactLinks.push(`<a href="${esc(igUrl(venue.instagram))}">${esc(igHandle(venue.instagram))}</a>`)

  const body = `
    ${gallery(photosOf(event), event.title)}
    <div class="content">
      ${cat && cat.name ? `<span class="cat">${esc(cat.name)}</span>` : ''}
      <h1>${esc(event.title)}</h1>
      <div class="meta">
        <div class="meta-row"><span class="ic">📅</span><span>${esc(formatDate(event.start_time))}</span></div>
        ${venue ? `<div class="meta-row"><span class="ic">📍</span><span>${esc(venue.name)}${venue.address ? `<br><span class="sub">${esc(venue.address)}</span>` : ''}</span></div>` : ''}
      </div>
      ${priceLabel(event) ? `<div class="price">${esc(priceLabel(event))}</div>` : ''}
      ${priceNote(event) ? `<p class="price-note">${esc(priceNote(event))}</p>` : ''}
      ${rawDesc ? `<p class="desc">${esc(rawDesc)}</p>` : ''}
      ${contactLinks.length ? `<div class="contact">${contactLinks.join('')}</div>` : ''}
      ${venue && venue.id && !venue.merchant_id ? `<div class="claim"><strong>¿Este es tu negocio?</strong><br>Este perfil se creó con información pública. Reclámalo gratis y toma el control de tus eventos.<br><a href="https://socios.enspotz.com/reclamar/${esc(venue.id)}">Reclamar mi negocio →</a></div>` : ''}
    </div>`

  res.statusCode = 200
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.end(pageShell({
    title: `${event.title} · Spotz`,
    desc: ogDesc,
    image: event.cover_image_url || '',
    url: canonical,
    body,
    app: `${APP_URL}/event/${encodeURIComponent(id)}`,
  }))
}

// Página pública de un evento — se sirve en https://spotz.online/event/:id
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
const APP_STORE_URL = 'https://spotz.online'
const PLAY_STORE_URL = 'https://spotz.online'
const HOME_URL = 'https://spotz.online'

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

function priceLabel(ev) {
  if (ev.is_free) return 'Gratis'
  if (ev.price_from) return `Desde $${ev.price_from} USD`
  return 'Por confirmar'
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

// SVG del rayo (favicon + logo)
const BOLT = '<svg width="22" height="22" viewBox="0 0 80 80" fill="none"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>'
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>')

function downloadBanner() {
  return `
    <section class="dl">
      <div class="dl-logo">${BOLT}<span class="wm">Spot<span style="color:${ORANGE}">z</span></span></div>
      <h2 class="dl-title">Descubre todos los planes de Caracas</h2>
      <p class="dl-sub">Eventos, conciertos y experiencias en un solo lugar. Recomendaciones con IA según tus gustos.</p>
      <div class="dl-btns">
        <a class="store" href="${esc(APP_STORE_URL)}">Descargar para iPhone</a>
        <a class="store" href="${esc(PLAY_STORE_URL)}">Descargar para Android</a>
      </div>
      <p class="dl-note">Próximamente en App Store y Google Play</p>
    </section>`
}

function pageShell({ title, desc, image, url, body }) {
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
    .hero { width:100%; aspect-ratio:16/10; object-fit:cover; background:${INK2}; display:block; }
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
    .desc { color:#C7D0DA; font-size:15px; line-height:1.7; white-space:pre-line; margin-bottom:24px; }
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
    .dl-note { margin-top:14px; color:rgba(255,255,255,0.6); font-size:12px; }
    .foot { text-align:center; padding:28px 20px 8px; }
    .foot a { color:#7E8C9E; font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">${BOLT}<span class="wm">Spot<span style="color:${ORANGE}">z</span></span></div>
    ${body}
    ${downloadBanner()}
    <div class="foot"><a href="${HOME_URL}">spotz.online · Eventos en Caracas</a></div>
  </div>
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
    const select = 'id,title,description,start_time,cover_image_url,is_free,price_from,' +
      'venue:venues(name,address,instagram,whatsapp),category:categories(name)'
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}&limit=1`,
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
    ${event.cover_image_url ? `<img class="hero" src="${esc(event.cover_image_url)}" alt="${esc(event.title)}">` : ''}
    <div class="content">
      ${cat && cat.name ? `<span class="cat">${esc(cat.name)}</span>` : ''}
      <h1>${esc(event.title)}</h1>
      <div class="meta">
        <div class="meta-row"><span class="ic">📅</span><span>${esc(formatDate(event.start_time))}</span></div>
        ${venue ? `<div class="meta-row"><span class="ic">📍</span><span>${esc(venue.name)}${venue.address ? `<br><span class="sub">${esc(venue.address)}</span>` : ''}</span></div>` : ''}
      </div>
      <div class="price">${esc(priceLabel(event))}</div>
      ${rawDesc ? `<p class="desc">${esc(rawDesc)}</p>` : ''}
      ${contactLinks.length ? `<div class="contact">${contactLinks.join('')}</div>` : ''}
    </div>`

  res.statusCode = 200
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.end(pageShell({
    title: `${event.title} · Spotz`,
    desc: ogDesc,
    image: event.cover_image_url || '',
    url: canonical,
    body,
  }))
}

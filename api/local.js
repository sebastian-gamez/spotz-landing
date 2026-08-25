// /local/:id — la ficha de un comercio aliado, renderizada EN EL SERVIDOR.
//
// POR QUE SERVER-SIDE Y NO ESTATICO + FETCH
// Toda la campana vive de compartir enlaces en Instagram y WhatsApp. El crawler
// de esas apps lee el HTML ANTES de que corra un solo fetch, asi que con una
// pagina estatica todos los enlaces del mundo ensenarian la misma tarjeta
// generica. Un socio que da una oferta exclusiva y ve su local compartido como
// "Spotz — Todo Caracas en tu bolsillo" tiene razon en molestarse.
//
// El og:title es LA OFERTA, no el local: lo que se comparte es el descuento.
//
// Clona el molde de api/event.js (pageShell, esc, igUrl, waUrl, downloadBanner)
// y reusa resolveCardDesign de assets/spotz-lib.js — el MISMO archivo que usa el
// navegador, para que la tarjeta se vea idéntica en la web y en la app.

const { rpc } = require('./_supabase')
const Lib = require('../assets/spotz-lib.js')

const HOME_URL = 'https://enspotz.com'
const PARTNER_GOAL = 20

const ORANGE = '#FF6B35'
const INK = '#0D1B2A'
const INK2 = '#111D2C'
const SURFACE = '#1B2E45'
const BORDER = '#31495F'
const MUTED = '#A7B4C2'

// El servidor de Vercel corre en UTC; isOpenNow() de spotz-lib lee getDay(),
// getHours() y getMinutes() LOCALES porque en la app "local" es el telefono del
// usuario, que esta en Caracas. Sin esto, un local abierto hasta las 23:00
// aparece cerrado desde las 19:00 hora de Caracas — cuatro horas de vida
// nocturna invisibles justo en las horas que importan.
//
// Devuelve un Date cuyos campos locales SON los de Caracas. El instante que
// representa es falso; los campos, que es lo unico que lee isOpenNow, son ciertos.
function caracasNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {})
  return new Date(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second))
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function igHandle(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = s.match(/instagram\.com\/([^/?#]+)/i)
  return '@' + (m ? m[1] : s.replace(/^@/, ''))
}
function igUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return 'https://instagram.com/' + s.replace(/^@/, '')
}
function waUrl(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits ? 'https://wa.me/' + digits : ''
}

const BOLT = '<svg width="22" height="22" viewBox="0 0 80 80" fill="none"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>'
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M44 8 L20 44 L34 44 L28 72 L58 32 L42 32 L52 8 Z" fill="' + ORANGE + '"/></svg>')

// ─── Tarjeta de cupon ────────────────────────────────────────────────────────
// Anatomia copiada de Spotz/app/(tabs)/cupones.tsx: radio 22, padding 18, borde
// rgba(255,255,255,0.12), logo 52 (radio = 52*0.26), badge en pildora, nombre del
// local a 30/900 con letter-spacing -0.6, y la oferta a 16/600.
function offerCard(venue, offer) {
  const d = Lib.resolveCardDesign(venue.name, offer.design)
  const isLoyalty = offer.type === 'loyalty'
  const logo = d.logoUrl || venue.logo_url

  const badgeIcon = isLoyalty
    ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="' + esc(d.onAccent) + '" stroke-width="2.2"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5"/></svg>'
    : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="' + esc(d.onAccent) + '" stroke-width="2.2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z"/></svg>'

  const badgeText = isLoyalty ? '0/' + (offer.stamps_required || 8) : 'Cupón'

  const mark = logo
    ? '<img src="' + esc(logo) + '" alt="" class="oc-logo">'
    : '<div class="oc-logo oc-initials" style="background:' + esc(d.accent) + ';color:' + esc(d.onAccent) + '">' + esc(Lib.initialsOf(venue.name)) + '</div>'

  // Sellos de fidelidad — espejo de StampProgress, size 16.
  let stamps = ''
  if (isLoyalty && offer.stamps_required) {
    const n = Math.min(Number(offer.stamps_required) || 0, 12)
    stamps = '<div class="oc-stamps">' +
      Array.from({ length: n }, () =>
        '<span style="border-color:' + esc(d.textMuted) + '"></span>').join('') +
      '</div>'
  }

  const footer = isLoyalty
    ? stamps + '<div class="oc-foot" style="color:' + esc(d.textMuted) + '"><span>Toca para empezar</span></div>'
    : '<div class="oc-foot" style="color:' + esc(d.textMuted) + '">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + esc(d.textMuted) + '" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3z"/></svg>' +
      '<span>Toca para activarlo</span></div>'

  return '<button class="oc" type="button"' +
    ' data-offer="' + esc(offer.id) + '"' +
    ' data-type="' + esc(offer.type) + '"' +
    ' data-title="' + esc(offer.title) + '"' +
    ' data-venue="' + esc(venue.name) + '"' +
    (isLoyalty ? ' data-stamps="' + esc(offer.stamps_required || 8) + '"' : '') +
    ' style="background:' + esc(Lib.cardBackground(d)) + '">' +
    '<div class="oc-top">' + mark +
      '<span class="oc-badge" style="background:' + esc(d.accent) + ';color:' + esc(d.onAccent) + '">' +
        badgeIcon + '<span>' + esc(badgeText) + '</span></span>' +
    '</div>' +
    '<div class="oc-hero">' +
      '<p class="oc-venue" style="color:' + esc(d.textColor) + '">' + esc(venue.name) + '</p>' +
      '<p class="oc-title" style="color:' + esc(d.textColor) + '">' + esc(offer.title) + '</p>' +
    '</div>' +
    footer +
  '</button>'
}

// ─── Tarjeta de experiencia ──────────────────────────────────────────────────
// Anatomia de Spotz/components/events/event-card.tsx: fila, radio 14, padding 14,
// fondo #1B2E45, borde #31495F, imagen 72x72, fecha 12, titulo 15/700.
function eventCard(venue, ev) {
  const price = Lib.formatPrice(ev)
  const when = Lib.formatDateTime(ev.start_time)
  return '<div class="ec">' +
    '<div class="ec-body">' +
      (when ? '<p class="ec-date">' + esc(when) + '</p>' : '') +
      '<p class="ec-title">' + esc(ev.title) + '</p>' +
      '<p class="ec-venue">' + esc(venue.name) + '</p>' +
      '<div class="ec-foot">' +
        (ev.category ? '<span class="ec-chip">' + esc(ev.category) + '</span>' : '') +
        (price ? '<span class="ec-price">' + esc(price) + '</span>' : '') +
      '</div>' +
    '</div>' +
    (ev.cover_image_url ? '<img class="ec-img" src="' + esc(ev.cover_image_url) + '" alt="">' : '<div class="ec-img"></div>') +
  '</div>'
}

function pageShell({ title, desc, image, url, body }) {
  const ogImage = image
    ? '<meta property="og:image" content="' + esc(image) + '">\n  <meta name="twitter:image" content="' + esc(image) + '">'
    : ''
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(url)}">
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
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
           background:${INK}; color:#fff; line-height:1.5; -webkit-font-smoothing:antialiased; }
    .wrap { max-width:560px; margin:0 auto; padding-bottom:48px; }
    .topbar { display:flex; align-items:center; gap:8px; padding:18px 20px;
              border-bottom:1px solid rgba(255,255,255,0.08); }
    .topbar .wm { font-weight:900; font-size:18px; letter-spacing:-0.02em; }
    .topbar .back { margin-left:auto; font-size:13px; color:${MUTED}; text-decoration:none; }
    .hero { width:100%; aspect-ratio:16/10; object-fit:cover; background:${INK2}; display:block; }
    .content { padding:22px 20px 0; }

    .tags { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
    .pill { border-radius:999px; padding:4px 10px; background:rgba(255,107,53,0.16);
            font-size:11px; font-weight:800; color:#FFB694; letter-spacing:0.2px; }
    .cat { font-size:12px; color:#7E8C9E; }
    h1 { font-size:30px; font-weight:900; line-height:1.08; letter-spacing:-0.6px; margin-bottom:8px; }
    .addr { display:flex; align-items:center; gap:7px; color:${MUTED}; font-size:13px; }

    .sec { padding:28px 20px 0; }
    .sec-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .sec-head h2 { font-size:19px; font-weight:800; letter-spacing:-0.3px; }
    .sec-head .n { font-size:12px; font-weight:600; color:${ORANGE}; }
    .list { display:flex; flex-direction:column; gap:14px; }

    /* Tarjeta de cupon — anatomia de la Cartera de la app */
    .oc { display:flex; flex-direction:column; justify-content:space-between; gap:22px;
          width:100%; text-align:left; min-height:172px; border-radius:22px; padding:18px;
          border:1px solid rgba(255,255,255,0.12); cursor:pointer; font:inherit;
          box-shadow:0 8px 16px rgba(0,0,0,0.35); transition:transform .1s; }
    .oc:active { transform:scale(0.99); }
    .oc-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .oc-logo { width:52px; height:52px; border-radius:13.5px; object-fit:cover;
               border:1px solid rgba(255,255,255,0.18); display:block; }
    .oc-initials { display:flex; align-items:center; justify-content:center;
                   font-weight:900; font-size:21px; }
    .oc-badge { display:inline-flex; align-items:center; gap:5px; border-radius:999px;
                padding:5px 11px; font-size:12px; font-weight:800; letter-spacing:0.3px; }
    .oc-hero { display:flex; flex-direction:column; gap:4px; }
    .oc-venue { font-size:30px; font-weight:900; letter-spacing:-0.6px; line-height:34px; }
    .oc-title { font-size:16px; font-weight:600; letter-spacing:-0.2px; }
    .oc-foot { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:500; }
    .oc-stamps { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .oc-stamps span { width:16px; height:16px; border-radius:50%; border:1.5px solid; display:block; }

    /* Tarjeta de experiencia — anatomia de event-card.tsx */
    .ec { display:flex; align-items:center; gap:12px; background:${SURFACE};
          border:1px solid ${BORDER}; border-radius:14px; padding:14px; }
    .ec-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
    .ec-date { color:${MUTED}; font-size:12px; font-weight:500; }
    .ec-title { color:#fff; font-size:15px; font-weight:700; line-height:20px; margin-top:1px; }
    .ec-venue { color:${MUTED}; font-size:13px; }
    .ec-foot { display:flex; align-items:center; gap:8px; margin-top:6px; }
    .ec-chip { padding:3px 8px; border-radius:6px; background:rgba(255,107,53,0.16);
               font-size:11px; font-weight:600; color:#FFB694; }
    .ec-price { color:${MUTED}; font-size:12px; font-weight:500; }
    .ec-img { width:72px; height:72px; border-radius:10px; flex-shrink:0; object-fit:cover;
              background:linear-gradient(150deg,#243A54,#12212F); display:block; }

    .contact { display:flex; gap:10px; padding:28px 20px 0; }
    .contact a { flex:1; text-align:center; font-size:14px; font-weight:600; color:#fff;
                 text-decoration:none; padding:13px; border-radius:14px; border:1px solid ${BORDER}; }

    .dl { margin:28px 20px 0; padding:24px 22px; border-radius:20px; text-align:center;
          background:linear-gradient(135deg, ${ORANGE} 0%, #E85A28 100%); }
    .dl-title { font-size:19px; font-weight:900; line-height:1.2; letter-spacing:-0.02em; margin-bottom:8px; }
    .dl-sub { color:rgba(255,255,255,0.85); font-size:13.5px; line-height:1.55; margin-bottom:16px; }
    .dl-btn { display:block; background:${INK}; color:#fff; font-weight:800; font-size:14px;
              padding:13px; border-radius:14px; text-decoration:none; }
    .dl-note { margin-top:12px; color:rgba(255,255,255,0.7); font-size:11.5px; }
    .foot { text-align:center; padding:28px 20px 8px; }
    .foot a { color:#7E8C9E; font-size:13px; text-decoration:none; }
    .empty { color:${MUTED}; font-size:14px; padding:4px 0 0; }

    /* ─── Panel de activacion (offer-island.js) ─────────────────────────── */
    .oc.is-mine { outline:2px solid rgba(255,255,255,0.5); outline-offset:2px; }
    .sheet[hidden] { display:none; }
    .sheet { position:fixed; inset:0; z-index:50; display:flex; align-items:flex-end;
             justify-content:center; }
    .sheet-bg { position:absolute; inset:0; background:rgba(5,10,17,0.72); backdrop-filter:blur(3px); }
    .sheet-card { position:relative; width:100%; max-width:420px; background:${INK2};
                  border:1px solid ${BORDER}; border-bottom:0;
                  border-radius:26px 26px 0 0; padding:26px 24px calc(28px + env(safe-area-inset-bottom));
                  animation:up .22s ease-out; max-height:92vh; overflow-y:auto; }
    @keyframes up { from { transform:translateY(14px); opacity:0 } to { transform:none; opacity:1 } }
    @media (min-width:520px) { .sheet { align-items:center; }
      .sheet-card { border-radius:26px; border-bottom:1px solid ${BORDER}; } }
    .sheet-x { position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%;
               background:rgba(255,255,255,0.08); border:0; color:#fff; font-size:14px; cursor:pointer; }
    .sheet-kicker { font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;
                    color:${ORANGE}; margin-bottom:6px; }
    .sheet-title { font-size:26px; font-weight:800; line-height:1.15; letter-spacing:-0.4px; }
    .sheet-venue { color:${MUTED}; font-size:14px; margin-top:4px; }
    .sheet-qr { width:200px; height:200px; margin:22px auto 16px; background:#fff;
                border-radius:16px; padding:12px; }
    .sheet-qr.is-empty { background:rgba(255,255,255,0.06); }
    .sheet-qr svg { display:block; width:100%; height:100%; shape-rendering:crispEdges; }
    .sheet-code { display:flex; align-items:center; justify-content:space-between; gap:12px;
                  width:100%; margin-top:14px; padding:14px 16px; border-radius:14px; cursor:pointer;
                  background:rgba(255,255,255,0.06); border:1px solid ${BORDER}; color:#fff;
                  font:inherit; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                  font-size:17px; font-weight:700; letter-spacing:1.6px; }
    .sheet-copy { font-family:inherit; font-size:12px; font-weight:600; letter-spacing:0;
                  color:${ORANGE}; flex-shrink:0; }
    .sheet-note { color:${MUTED}; font-size:13px; line-height:1.5; margin-top:12px; }
    .sheet-warn { color:#7E8C9E; font-size:11.5px; line-height:1.5; margin-top:12px;
                  border-top:1px solid rgba(255,255,255,0.07); padding-top:12px; }
    .sheet-err { color:#FFB694; font-size:14px; line-height:1.5; margin-top:16px; }
    .sheet-btn { width:100%; margin-top:18px; padding:14px; border:0; border-radius:14px; cursor:pointer;
                 background:${ORANGE}; color:#fff; font:inherit; font-size:15px; font-weight:800; }
    .sheet-spin { width:34px; height:34px; margin:30px auto 6px; border-radius:50%;
                  border:3px solid rgba(255,255,255,0.14); border-top-color:${ORANGE};
                  animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg) } }
    @media (prefers-reduced-motion:reduce) {
      .sheet-card { animation:none } .sheet-spin { animation-duration:2s }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">${BOLT}<span class="wm">Spot<span style="color:${ORANGE}">z</span></span>
      <a class="back" href="${HOME_URL}/#mapa">← Volver al mapa</a></div>
    ${body}
    <div class="foot"><a href="${HOME_URL}">enspotz.com · Eventos en Caracas</a></div>
  </div>
  <script src="/assets/spotz-config.js"></script>
  <script src="/assets/offer-island.js" defer></script>
</body>
</html>`
}

function notFoundPage(url) {
  return pageShell({
    title: 'Este local todavía no está en Spotz',
    desc: 'Descubre los comercios aliados de Caracas en enspotz.com.',
    image: HOME_URL + '/assets/og.jpg',
    url,
    body: `<div class="content" style="padding-bottom:24px">
      <h1>Este local todavía no está en Spotz</h1>
      <p class="empty">O el enlace es incorrecto, o el comercio ya no está en el mapa.
        Mira los que sí están — cada uno tiene una oferta que solo existe aquí.</p>
    </div>
    <div class="sec"><a class="dl-btn" href="${HOME_URL}/#mapa"
      style="background:${ORANGE};color:#fff">Ver el mapa →</a></div>`,
  })
}

function downloadBanner(total) {
  const left = Math.max(0, PARTNER_GOAL - total)
  const sub = total > 0
    ? `Ya hay ${total} ${total === 1 ? 'local' : 'locales'} con oferta en el mapa. Faltan ${left}.`
    : 'Cada local que se suma trae una oferta que solo existe aquí.'
  return `<div class="dl">
    <p class="dl-title">Descubre todos los planes de Caracas</p>
    <p class="dl-sub">${esc(sub)}</p>
    <a class="dl-btn" href="${HOME_URL}/#mapa">Ver el mapa →</a>
    <p class="dl-note">Próximamente en App Store y Google Play</p>
  </div>`
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || ''
  const canonical = `${HOME_URL}/local/${encodeURIComponent(id)}`

  if (!id) {
    res.statusCode = 302
    res.setHeader('Location', HOME_URL)
    return res.end()
  }

  // UNA sola llamada a public_partners(), la misma que alimenta el mapa y el
  // contador. Asi la web publica no tiene dos definiciones de "socio", y un
  // comercio dado de baja deja de tener ficha automaticamente.
  const data = await rpc('public_partners')
  const partners = Array.isArray(data) ? data : []

  const venue = partners.find((p) => p.id === id) || null

  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (!venue) {
    res.statusCode = 404
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.end(notFoundPage(canonical))
  }

  const offers = venue.offers || []
  const rawEvents = venue.events || []

  // Misma regla que la app: una experiencia recurrente solo se muestra si el
  // local esta abierto segun su horario. Sin horario -> disponible.
  const ahora = caracasNow()
  const events = rawEvents.filter((ev) =>
    Lib.isEventAvailable(Object.assign({}, ev, { opening_hours: venue.opening_hours }), ahora))

  const headline = offers.length ? offers[0].title : venue.name

  const contact = []
  if (venue.whatsapp) contact.push(`<a href="${esc(waUrl(venue.whatsapp))}">WhatsApp</a>`)
  if (venue.instagram) contact.push(`<a href="${esc(igUrl(venue.instagram))}">${esc(igHandle(venue.instagram))}</a>`)

  const body = `
    ${venue.cover_image_url ? `<img class="hero" src="${esc(venue.cover_image_url)}" alt="${esc(venue.name)}">` : ''}
    <div class="content">
      <div class="tags">
        <span class="pill">SOCIO ALIADO · ${partners.length} DE ${PARTNER_GOAL}</span>
        ${venue.category ? `<span class="cat">${esc(venue.category)}</span>` : ''}
      </div>
      <h1>${esc(venue.name)}</h1>
      <div class="addr">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>
        <span>${esc([venue.zona, venue.address].filter(Boolean).join(' · '))}</span>
      </div>
    </div>

    ${offers.length ? `<div class="sec">
      <div class="sec-head">
        <h2>Cupones y tarjetas</h2>
        <span class="n">${offers.length} ${offers.length === 1 ? 'disponible' : 'disponibles'}</span>
      </div>
      <div class="list">${offers.map((o) => offerCard(venue, o)).join('')}</div>
    </div>` : ''}

    ${events.length ? `<div class="sec">
      <div class="sec-head">
        <h2>Experiencias</h2>
        <span class="n">${events.length} ${events.length === 1 ? 'disponible' : 'disponibles'}</span>
      </div>
      <div class="list">${events.map((e) => eventCard(venue, e)).join('')}</div>
    </div>` : ''}

    ${contact.length ? `<div class="contact">${contact.join('')}</div>` : ''}
    ${downloadBanner(partners.length)}`

  // El titular es LA OFERTA, no el local: lo que se comparte es el descuento.
  // El gancho es la descripcion; los `terms` son letra pequena y solo entran si
  // no hay nada mejor. Compartir "No acumulable con otras promociones" como
  // reclamo es la forma mas rapida de que nadie abra el enlace.
  const hook = offers.length
    ? (offers[0].description || offers[0].reward_description || offers[0].terms || '').trim()
    : ''
  const lugar = `${venue.name}${venue.zona ? ' · ' + venue.zona : ''}`
  const desc = offers.length
    ? `${lugar}. Solo en enspotz.com${hook ? '. ' + hook.slice(0, 150) : '.'}`
    : `${lugar} — en el mapa de Spotz.`

  res.statusCode = 200
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.end(pageShell({
    title: offers.length ? `${headline} en ${venue.name} · Spotz` : `${venue.name} · Spotz`,
    desc,
    image: (offers[0] && offers[0].image_url) || venue.cover_image_url || `${HOME_URL}/assets/og.jpg`,
    url: canonical,
    body,
  }))
}

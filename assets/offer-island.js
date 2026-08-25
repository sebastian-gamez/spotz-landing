/* ============================================================================
 * offer-island.js — activar un cupón desde la web, sin instalar nada.
 *
 * Es la promesa entera de la campaña: "cada local trae una oferta que solo
 * existe aquí". Si para cobrarla hubiera que esperar al lanzamiento de la app,
 * los 45 días de video no venden nada.
 *
 * COMO FUNCIONA
 *   1. Sesión ANÓNIMA de Supabase (POST /auth/v1/signup con body vacío). No
 *      pide correo: el primer roce con el usuario es el cupón, no un formulario.
 *   2. activate_offer(p_offer_id) — la MISMA RPC que usa la app. Devuelve el id
 *      de la fila en user_coupons o loyalty_cards.
 *   3. Se lee `qr_token` de esa fila (RLS: user_id = auth.uid()).
 *   4. QR + código corto. El comercio escanea, o teclea el código.
 *
 * LO QUE ESTO NO ES
 * No hay lógica de negocio aquí. Las siete razones por las que una oferta puede
 * no activarse las decide Postgres dentro de activate_offer; este archivo solo
 * TRADUCE la excepción. Si algún día cambian, cambian en un sitio.
 *
 * ⚠️ DEPENDE DE UN AJUSTE DEL PANEL: Authentication → Providers → Anonymous
 * sign-ins ENABLED. Sin eso el paso 1 devuelve 422 y no hay cupón. El error se
 * distingue y se dice en voz alta en vez de morir en la consola.
 *
 * ⚠️ EL CUPÓN VIVE EN ESTE NAVEGADOR. Una sesión anónima no se puede recuperar
 * desde otro dispositivo. Por eso el panel lo dice y ofrece copiar el código.
 * Enlazar la sesión anónima a un correo al lanzar la app es tarea aparte.
 * ========================================================================== */

(function () {
  'use strict'

  var S = window.SPOTZ
  var AUTH = S.SUPABASE_URL + '/auth/v1'
  var REST = S.SUPABASE_URL + '/rest/v1'
  var KEY = 'spotz.web.session'

  /* ─── Sesión anónima ─────────────────────────────────────────────────── */

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) { return null }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) { /* modo privado */ }
    return s
  }

  function shape(json) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      /* `expires_at` viene en segundos epoch; si falta, lo derivamos. */
      expires_at: json.expires_at || (Math.floor(Date.now() / 1000) + (json.expires_in || 3600)),
      user_id: json.user && json.user.id,
    }
  }

  function authFetch(path, body) {
    return fetch(AUTH + path, {
      method: 'POST',
      headers: { apikey: S.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /** Devuelve un access_token válido, creando o renovando la sesión anónima. */
  function session() {
    var s = load()
    var now = Math.floor(Date.now() / 1000)

    if (s && s.access_token && s.expires_at > now + 60) return Promise.resolve(s)

    if (s && s.refresh_token) {
      return authFetch('/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('refresh')) })
        .then(function (j) { return save(shape(j)) })
        /* Un refresh_token caducado o revocado no es un error del usuario:
         * se tira la sesión y se abre una nueva. El cupón anterior sigue en la
         * base a nombre del usuario viejo, pero ya era irrecuperable. */
        .catch(function () { try { localStorage.removeItem(KEY) } catch (e) {} ; return signUp() })
    }

    return signUp()
  }

  function signUp() {
    return authFetch('/signup', { data: {}, gotrue_meta_security: {} })
      .then(function (r) {
        if (r.ok) return r.json()
        return r.json().catch(function () { return {} }).then(function (j) {
          var msg = String(j.msg || j.error_description || j.message || '')
          if (r.status === 422 || /anonymous/i.test(msg)) {
            throw new Error('ANON_OFF')
          }
          throw new Error(msg || ('signup ' + r.status))
        })
      })
      .then(function (j) { return save(shape(j)) })
  }

  /* ─── Las siete puertas de activate_offer ────────────────────────────── */
  /* Copiadas de 20260805000000_fase8_profiles_rls_hardening.sql. El texto es
   * el del `raise exception`; si cambia allí, deja de traducirse aquí y el
   * usuario ve el mensaje genérico — nunca una pantalla en blanco. */
  var EXCUSAS = {
    'not authenticated':
      'No pudimos abrir tu sesión. Recarga la página e inténtalo otra vez.',
    'offer not found':
      'Esta oferta ya no existe.',
    'offer not available':
      'Esta oferta no está publicada ahora mismo.',
    'offer not approved':
      'Esta oferta está en revisión por el equipo de Spotz. Vuelve en un rato.',
    'offer out of window':
      'Esta oferta está fuera de sus fechas. Ya terminó o todavía no ha empezado.',
    'venue is not claimed':
      'Este local todavía no ha terminado de darse de alta en Spotz.',
    'merchant not verified':
      'Este comercio está pendiente de verificación por el equipo de Spotz.',
    'ANON_OFF':
      'Activar cupones desde la web está desactivado en este momento. Escríbenos por Instagram y te lo damos a mano.',
  }

  function traducir(err) {
    var m = String((err && err.message) || err || '')
    if (EXCUSAS[m]) return EXCUSAS[m]
    for (var k in EXCUSAS) if (m.indexOf(k) !== -1) return EXCUSAS[k]
    if (/Failed to fetch|NetworkError/i.test(m)) {
      return 'Sin conexión. Revisa tus datos y vuelve a intentarlo.'
    }
    return 'No pudimos activar el cupón. Inténtalo de nuevo en un momento.'
  }

  /* ─── Activación ─────────────────────────────────────────────────────── */

  function activate(offerId, type) {
    var tok
    return session()
      .then(function (s) {
        tok = s.access_token
        return fetch(REST + '/rpc/activate_offer', {
          method: 'POST',
          headers: {
            apikey: S.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + tok,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_offer_id: offerId }),
        })
      })
      .then(function (r) {
        if (r.ok) return r.json()
        return r.json().catch(function () { return {} }).then(function (j) {
          throw new Error(j.message || j.hint || ('rpc ' + r.status))
        })
      })
      .then(function (id) {
        /* activate_offer devuelve el uuid de la fila, no el token. El token hay
         * que leerlo, y solo lo deja ver la política `..._select_own`. */
        var tabla = type === 'loyalty' ? 'loyalty_cards' : 'user_coupons'
        var cols = type === 'loyalty' ? 'qr_token,stamps_count' : 'qr_token,status'
        return fetch(REST + '/' + tabla + '?id=eq.' + encodeURIComponent(id) + '&select=' + cols, {
          headers: {
            apikey: S.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + tok,
            Accept: 'application/vnd.pgrst.object+json',
          },
        })
      })
      .then(function (r) {
        if (!r.ok) throw new Error('no se pudo leer el cupón')
        return r.json()
      })
  }

  /** Mismo corte que Spotz/app/coupon/[id].tsx:68 — 14 caracteres, sin guiones. */
  function shortCode(token) {
    return String(token || '').replace(/-/g, '').slice(0, 14).toUpperCase()
  }

  /* ─── QR ─────────────────────────────────────────────────────────────── */
  /* qrcode-generator (kazuhikoarase) va por CDN, igual que supabase-js y
   * Tailwind en index.html: no es una clase de riesgo nueva. Si no carga, el
   * código corto se agranda y sigue sirviendo — ese es el camino que Partner
   * ya soporta a mano. Por eso el QR nunca es un requisito duro. */
  var qrReady = null
  function loadQr() {
    if (qrReady) return qrReady
    qrReady = new Promise(function (resolve, reject) {
      if (window.qrcode) return resolve(window.qrcode)
      var s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
      s.onload = function () { window.qrcode ? resolve(window.qrcode) : reject(new Error('qr')) }
      s.onerror = function () { reject(new Error('qr')) }
      document.head.appendChild(s)
    })
    return qrReady
  }

  function pintarQr(el, token) {
    return loadQr().then(function (qrcode) {
      /* typeNumber 0 = que la librería elija el tamaño mínimo. 'M' es el nivel
       * de corrección que usa la app. */
      var q = qrcode(0, 'M')
      q.addData(token)
      q.make()
      el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true })
      var svg = el.querySelector('svg')
      if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%') }
      el.classList.remove('is-empty')
    }).catch(function () {
      el.remove()
    })
  }

  /* ─── Panel ──────────────────────────────────────────────────────────── */

  var sheet = null

  function abrir() {
    if (sheet) { sheet.hidden = false; return sheet }
    sheet = document.createElement('div')
    sheet.className = 'sheet'
    sheet.innerHTML =
      '<div class="sheet-bg" data-close></div>' +
      '<div class="sheet-card" role="dialog" aria-modal="true" aria-live="polite">' +
        '<button class="sheet-x" type="button" data-close aria-label="Cerrar">✕</button>' +
        '<div class="sheet-body"></div>' +
      '</div>'
    sheet.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) cerrar()
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet && !sheet.hidden) cerrar()
    })
    document.body.appendChild(sheet)
    return sheet
  }

  function cerrar() {
    if (sheet) sheet.hidden = true
    document.body.style.overflow = ''
  }

  function cuerpo() { return sheet.querySelector('.sheet-body') }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function pintarCargando(titulo) {
    cuerpo().innerHTML =
      '<p class="sheet-kicker">Activando</p>' +
      '<p class="sheet-title">' + esc(titulo) + '</p>' +
      '<div class="sheet-spin"></div>' +
      '<p class="sheet-note">Un segundo…</p>'
  }

  function pintarError(titulo, msg, reintentar) {
    cuerpo().innerHTML =
      '<p class="sheet-kicker">No se pudo</p>' +
      '<p class="sheet-title">' + esc(titulo) + '</p>' +
      '<p class="sheet-err">' + esc(msg) + '</p>' +
      '<button class="sheet-btn" type="button" data-retry>Intentar otra vez</button>'
    cuerpo().querySelector('[data-retry]').onclick = reintentar
  }

  function pintarCupon(card, fila, meta) {
    var code = shortCode(fila.qr_token)
    var esFidelidad = meta.type === 'loyalty'
    var usado = fila.status === 'redeemed'

    cuerpo().innerHTML =
      '<p class="sheet-kicker">' + (esFidelidad ? 'Tu tarjeta' : 'Tu cupón') + '</p>' +
      '<p class="sheet-title">' + esc(meta.title) + '</p>' +
      '<p class="sheet-venue">' + esc(meta.venue) + '</p>' +
      (usado
        ? '<p class="sheet-err">Este cupón ya se canjeó.</p>'
        : '<div class="sheet-qr is-empty"></div>') +
      '<button class="sheet-code" type="button" data-copy>' +
        '<span>' + esc(code) + '</span>' +
        '<span class="sheet-copy">Copiar</span>' +
      '</button>' +
      '<p class="sheet-note">' +
        (esFidelidad
          ? 'Enséñala en el local para que te sellen. '
          : 'Enséñalo en el local antes de pagar. ') +
        'Si no pueden escanear, vale el código.' +
      '</p>' +
      '<p class="sheet-warn">Guardado en <b>este navegador</b>. Si lo borras o cambias de teléfono, se pierde — copia el código por si acaso.</p>'

    var qr = cuerpo().querySelector('.sheet-qr')
    if (qr) pintarQr(qr, fila.qr_token)

    var btn = cuerpo().querySelector('[data-copy]')
    btn.onclick = function () {
      var etiqueta = btn.querySelector('.sheet-copy')
      var ok = function () { etiqueta.textContent = '¡Copiado!' ; setTimeout(function () { etiqueta.textContent = 'Copiar' }, 1800) }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(ok, function () { etiqueta.textContent = 'Cópialo a mano' })
      } else {
        etiqueta.textContent = 'Cópialo a mano'
      }
    }

    /* La tarjeta de la lista pasa a decir que ya es tuya. */
    card.classList.add('is-mine')
    var pie = card.querySelector('.oc-foot span')
    if (pie) pie.textContent = 'Activado · ' + code
  }

  /* ─── Enganche ───────────────────────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('.oc')
    if (!card) return

    var meta = {
      id: card.getAttribute('data-offer'),
      type: card.getAttribute('data-type'),
      title: card.getAttribute('data-title') || '',
      venue: card.getAttribute('data-venue') || '',
    }
    if (!meta.id) return

    abrir().hidden = false
    document.body.style.overflow = 'hidden'

    var intentar = function () {
      pintarCargando(meta.title)
      activate(meta.id, meta.type).then(
        function (fila) { pintarCupon(card, fila, meta) },
        function (err) {
          if (window.console) console.warn('[spotz] activate_offer:', err)
          pintarError(meta.title, traducir(err), intentar)
        }
      )
    }
    intentar()
  })
})()

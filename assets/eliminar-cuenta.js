/* ============================================================================
 * eliminar-cuenta.js — la lógica de /eliminar-cuenta (Google Play exige una URL
 * pública para borrar la cuenta sin instalar la app).
 *
 * POR QUÉ LA CONTRASEÑA NO SALE DE AQUÍ
 * Antes el correo y la contraseña viajaban a /api/delete-account y la función
 * los probaba contra Supabase desde el servidor de Vercel. Eso convertía la
 * función en un oráculo para adivinar contraseñas: todas las peticiones salían
 * de las IP de Vercel, así que los límites por IP de Supabase no veían al
 * atacante, y la acción 'verify' respondía 200/401 sin borrar nada.
 *
 * Ahora:
 *   1. El navegador inicia sesión con signInWithPassword (límites por IP de
 *      Supabase sobre la IP real de quien prueba).
 *   2. A /api/delete-account solo viaja el access_token (Authorization: Bearer).
 *      La función lo valida contra Supabase y borra la cuenta de ESE usuario.
 *   3. Al terminar (o al cancelar) se cierra la sesión.
 *
 * La sesión vive solo en memoria (persistSession: false): esta página comparte
 * origen con la app (/app), y no debe pisar ni cerrar la sesión que la app
 * guarda en localStorage.
 * ========================================================================== */

(function () {
  'use strict'

  var S = window.SPOTZ
  var sb = window.supabase.createClient(S.SUPABASE_URL, S.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'spotz-eliminar-cuenta',
    },
  })

  var $ = function (id) { return document.getElementById(id) }
  var form = $('form'), modal = $('modal'), done = $('done')
  var confirmInput = $('confirmInput'), confirmBtn = $('confirmBtn'), submitBtn = $('submitBtn')

  function mode() { return form.querySelector('input[name=mode]:checked').value }

  function showFormError(msg) { var e = $('formError'); e.textContent = msg; e.classList.remove('hidden') }
  function hideFormError() { $('formError').classList.add('hidden') }
  function showModalError(msg) { var e = $('modalError'); e.textContent = msg; e.classList.remove('hidden') }

  /** Cierra la sesión de esta página. `local`: solo esta sesión, no las de la
   *  app en otros dispositivos (importa en el modo "borrar datos"). */
  function cerrarSesion() {
    return sb.auth.signOut({ scope: 'local' }).catch(function () {})
  }

  /** Traduce el error de signInWithPassword. Nunca distingue "no existe ese
   *  correo" de "contraseña mala": Supabase tampoco lo hace. */
  function errorDeLogin(error) {
    var code = String(error.code || '')
    var msg = String(error.message || '')
    if (error.status === 429 || code === 'over_request_rate_limit') {
      return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
    }
    if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) {
      return 'Tu correo todavía no está confirmado. Revisa tu bandeja de entrada o escríbenos.'
    }
    if (code === 'invalid_credentials' || error.status === 400) {
      return 'Correo o contraseña incorrectos.'
    }
    if (!error.status || /fetch|network/i.test(msg)) {
      return 'Error de conexión. Intenta de nuevo.'
    }
    return 'No pudimos verificar tus datos. Intenta de nuevo.'
  }

  // Paso 1: verificar la contraseña en el navegador → abrir el modal.
  form.addEventListener('submit', function (ev) {
    ev.preventDefault()
    hideFormError()
    var email = $('email').value.trim()
    var password = $('password').value
    if (!email || !password) { showFormError('Completa tu correo y contraseña.'); return }

    submitBtn.disabled = true
    submitBtn.textContent = 'Verificando…'
    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error || !res.data || !res.data.session) {
          showFormError(res.error ? errorDeLogin(res.error) : 'No pudimos verificar tus datos. Intenta de nuevo.')
          return
        }
        // La contraseña ya no hace falta: fuera del DOM.
        $('password').value = ''
        openModal()
      })
      .catch(function () { showFormError('Error de conexión. Intenta de nuevo.') })
      .then(function () {
        submitBtn.disabled = false
        submitBtn.textContent = 'Continuar'
      })
  })

  function openModal() {
    var isAccount = mode() === 'account'
    $('modalTitle').textContent = isAccount ? 'Eliminar tu cuenta' : 'Borrar tus datos'
    $('modalBody').textContent = isAccount
      ? 'Vamos a eliminar de forma permanente tu cuenta de Spotz y todos tus datos (perfil, favoritos e historial). Esta acción no se puede deshacer.'
      : 'Vamos a borrar tus datos de navegación, favoritos y gustos. Tu cuenta seguirá activa. Esta acción no se puede deshacer.'
    confirmInput.value = ''
    confirmBtn.disabled = true
    confirmBtn.textContent = 'Borrar'
    $('modalError').classList.add('hidden')
    modal.classList.remove('hidden')
    confirmInput.focus()
  }

  /** Cancelar, o la sesión caducó: se cierra todo y hay que volver a empezar. */
  function closeModal(motivo) {
    modal.classList.add('hidden')
    cerrarSesion()
    if (motivo) showFormError(motivo)
    $('password').focus()
  }

  confirmInput.addEventListener('input', function () {
    confirmBtn.disabled = confirmInput.value.trim().toLowerCase() !== 'borrar'
  })
  $('cancelBtn').addEventListener('click', function () { closeModal() })

  // Paso 2: borrar. Solo viaja el access_token.
  confirmBtn.addEventListener('click', function () {
    confirmBtn.disabled = true
    confirmBtn.textContent = 'Borrando…'
    var chosen = mode()

    // getSession() renueva el token si caducó mientras el modal estaba abierto.
    sb.auth.getSession()
      .then(function (res) {
        var token = res && res.data && res.data.session && res.data.session.access_token
        if (!token) return { expired: true }
        return fetch('/api/delete-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            mode: chosen,
            reason: $('reason').value,
            confirm: confirmInput.value.trim(),
          }),
        }).then(function (r) {
          return r.json().catch(function () { return {} }).then(function (data) {
            return { status: r.status, ok: r.ok && data.ok, data: data }
          })
        })
      })
      .then(function (out) {
        if (out.expired || out.status === 401) {
          closeModal('Tu sesión caducó. Escribe otra vez tu contraseña para continuar.')
          return
        }
        if (!out.ok) {
          showModalError('No se pudo completar. Intenta de nuevo o escríbenos.')
          confirmBtn.disabled = false
          confirmBtn.textContent = 'Borrar'
          return
        }
        modal.classList.add('hidden')
        cerrarSesion()
        var isAccount = out.data.mode === 'account'
        $('doneTitle').textContent = isAccount ? 'Cuenta eliminada' : 'Datos borrados'
        $('doneBody').textContent = isAccount
          ? 'Tu cuenta y tus datos fueron eliminados de Spotz. Gracias por haber usado la app.'
          : 'Tus datos de navegación y gustos fueron borrados. Tu cuenta sigue activa.'
        done.classList.remove('hidden')
      })
      .catch(function () {
        showModalError('Error de conexión. Intenta de nuevo.')
        confirmBtn.disabled = false
        confirmBtn.textContent = 'Borrar'
      })
  })
})()

/* ============================================================================
 * comercios.js — el formulario de /comercios → tabla business_interest.
 *
 * DOS FRENOS PARA BOTS, ANTES DE TOCAR LA BASE
 *   1. Campo trampa (#sitio_web): invisible para una persona; un bot que
 *      rellena todo lo rellena.
 *   2. Tiempo mínimo: nadie escribe nombre, correo y "¿Qué ofreces?" en menos
 *      de 3 segundos desde que carga la página.
 * Si salta cualquiera de los dos se enseña el mismo "¡Registro recibido!" y NO
 * se inserta nada: al bot no se le dice qué lo delató.
 *
 * Esto solo frena a los bots que usan el formulario. El freno de verdad está en
 * Postgres (checks de longitud y de formato, y un registro por correo y
 * negocio), porque la anon key es pública y se puede insertar sin pasar por
 * aquí. Los maxlength del HTML son los mismos topes, para que una persona nunca
 * choque con el de la base.
 *
 * El cliente de Supabase va SIN sesión (persistSession: false): esta página
 * comparte origen con la app (/app) y, con las opciones por defecto, leería y
 * renovaría la sesión que la app guarda en localStorage.
 * ========================================================================== */

(function () {
  'use strict'

  var MIN_MS = 3000
  var abierta = Date.now()

  var S = window.SPOTZ
  var db = window.supabase.createClient(S.SUPABASE_URL, S.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'spotz-comercios' },
  })

  var $ = function (id) { return document.getElementById(id) }
  var form = $('business-form')
  var submitBtn = $('submit-btn')
  var errorEl = $('form-error')
  var successEl = $('success-state')

  /** Valor recortado y con el mismo tope que el maxlength del campo. */
  function campo(id) {
    var el = $(id)
    var max = Number(el.getAttribute('maxlength')) || 1000
    return el.value.trim().slice(0, max)
  }

  function exito() {
    form.classList.add('hidden')
    successEl.classList.remove('hidden')
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()

    // Frenos para bots: mismo "éxito", sin insertar.
    if ($('sitio_web').value !== '' || Date.now() - abierta < MIN_MS) {
      exito()
      return
    }

    var data = {
      business_name: campo('business_name'),
      contact_name:  campo('contact_name'),
      email:         campo('contact_email').toLowerCase(),
      phone:         campo('phone') || null,
      category:      $('category').value,
      description:   campo('description'),
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Enviando...'
    errorEl.classList.add('hidden')

    db.from('business_interest').insert(data).then(function (res) {
      // 23505 = ya teníamos ese correo con ese negocio: para quien lo envía,
      // el registro está hecho.
      if (!res.error || res.error.code === '23505') { exito(); return }
      submitBtn.disabled = false
      submitBtn.textContent = 'Registrar mi negocio en Spotz →'
      errorEl.textContent = 'Algo salió mal. Inténtalo de nuevo.'
      errorEl.classList.remove('hidden')
    })
  })
})()

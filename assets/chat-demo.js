/*
 * chat-demo.js — el teléfono con el chat animado del hero de la landing.
 *
 * El guion son 12 pasos (0-11). Cada pieza del chat dice en qué pasos se ve con
 * data-from (y data-to si desaparece después); este módulo solo mueve el número
 * de paso, teclea el input letra a letra y enciende el paso de "Así se usa el
 * chat" que toca (pasos 0-2 → 1, 3-7 → 2, 8-11 → 3).
 *
 *   0  teclea la primera pregunta        6  tercer lugar
 *   1  burbuja del usuario               7  tarjetas + pista de comparar
 *   2  "Buscando entre 1.000 lugares"    8  teclea "guárdame el bar de vinos"
 *   3  respuesta de la IA                9  burbuja del usuario
 *   4  primer lugar                      10 indicador de escritura
 *   5  segundo lugar                     11 "Listo, quedó en tus favoritos" + corazón
 *
 * Se pausa con el ratón encima, cuando el teléfono sale de pantalla y cuando la
 * pestaña no está visible. Con prefers-reduced-motion se queda en el paso final.
 * El HTML ya trae el estado final pintado: sin JS se ve la conversación entera.
 */
(function () {
  'use strict'

  var TEXTS = ['algo tranquilo para dos el viernes, cerca de Chacao', 'guárdame el bar de vinos']
  // Cuánto se queda cada paso antes de pasar al siguiente (ms). 0 y 8 teclean.
  var WAIT = { 1: 600, 2: 1600, 3: 700, 4: 380, 5: 380, 6: 500, 7: 1900, 9: 600, 10: 1100, 11: 3400 }
  var LAST = 11
  var TAIL = 30   // el input enseña solo los últimos 30 caracteres, como un input de verdad

  function phaseOf(step) { return step <= 2 ? 1 : (step <= 7 ? 2 : 3) }

  function setup(root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-from]')).map(function (el) {
      return {
        el: el,
        from: Number(el.getAttribute('data-from')),
        to: el.hasAttribute('data-to') ? Number(el.getAttribute('data-to')) : Infinity
      }
    })
    var text = root.querySelector('[data-chat-text]')
    var placeholder = root.querySelector('[data-chat-placeholder]')
    var caret = root.querySelector('[data-chat-caret]')
    var sendOn = root.querySelector('[data-chat-send="on"]')
    var sendOff = root.querySelector('[data-chat-send="off"]')
    var stepsSel = root.getAttribute('data-chat-steps')
    var stepEls = stepsSel ? document.querySelectorAll(stepsSel + ' [data-phase]') : []

    var step = LAST
    var typed = 0
    var timer = null
    var pending = null      // lo que tocaba hacer cuando llegó la pausa
    var lastPhase = 0
    var running = false
    var why = { hover: false, offscreen: false, hidden: !!document.hidden }

    function paused() { return why.hover || why.offscreen || why.hidden }

    function show(el, on) { if (el && el.hidden === on) el.hidden = !on }

    function render() {
      for (var i = 0; i < items.length; i++) {
        var it = items[i]
        // Pasar de oculto a visible reinicia su animación CSS de entrada.
        show(it.el, step >= it.from && step <= it.to)
      }
      var q = step === 0 ? TEXTS[0] : (step === 8 ? TEXTS[1] : '')
      var input = q.slice(0, typed)
      if (text) text.textContent = input.length > TAIL ? '…' + input.slice(-TAIL) : input
      show(text, input.length > 0)
      show(placeholder, input.length === 0)
      show(caret, step === 0 || step === 8)
      show(sendOn, input.length > 0)
      show(sendOff, input.length === 0)
    }

    function report() {
      var phase = phaseOf(step)
      if (phase !== lastPhase) {
        lastPhase = phase
        for (var i = 0; i < stepEls.length; i++) {
          var on = Number(stepEls[i].getAttribute('data-phase')) === phase
          stepEls[i].classList.toggle('is-on', on)
          if (on) stepEls[i].setAttribute('aria-current', 'step')
          else stepEls[i].removeAttribute('aria-current')
        }
      }
      root.dispatchEvent(new CustomEvent('spotz:chatstep', { detail: { step: step, phase: phase }, bubbles: true }))
    }

    function later(fn, ms) {
      clearTimeout(timer)
      timer = setTimeout(function () {
        timer = null
        if (!running) return
        if (paused()) { pending = fn; return }
        fn()
      }, ms)
    }

    function resume() {
      if (running && !paused() && pending) {
        var fn = pending
        pending = null
        fn()
      }
    }

    function tick() {
      if (step === 0 || step === 8) {
        var q = TEXTS[step === 0 ? 0 : 1]
        if (typed < q.length) {
          typed += 1
          render()
          later(tick, 38 + Math.random() * 45)
          return
        }
        later(advance, 550)
        return
      }
      later(advance, WAIT[step] || 600)
    }

    function advance() {
      step = step >= LAST ? 0 : step + 1
      typed = 0
      render()
      report()
      tick()
    }

    function start() {
      running = true
      pending = null
      step = 0
      typed = 0
      render()
      report()
      tick()
    }

    function showFinal() {
      running = false
      pending = null
      clearTimeout(timer)
      step = LAST
      typed = 0
      render()
      report()
    }

    // Ratón encima = pausa (solo ratón: en táctil un toque no debe congelarlo).
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { why.hover = true } })
    root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { why.hover = false; resume() } })

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        why.offscreen = !entries[entries.length - 1].isIntersecting
        resume()
      }).observe(root)
    }

    document.addEventListener('visibilitychange', function () {
      why.hidden = document.hidden
      resume()
    })

    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    function applyMotion() { if (mq && mq.matches) showFinal(); else start() }
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', applyMotion)
      else if (mq.addListener) mq.addListener(applyMotion)
    }

    applyMotion()
    root.setAttribute('data-ready', '')
  }

  var roots = document.querySelectorAll('[data-chat-demo]')
  for (var i = 0; i < roots.length; i++) setup(roots[i])
})()

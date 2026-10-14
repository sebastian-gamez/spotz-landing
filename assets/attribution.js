/*
 * Atribución de primer contacto y conteo agregado de visitas (2026-10-13).
 *
 * 1. Primer contacto: si la URL trae utm_source / utm_medium / utm_campaign / utm_content / ref, o se
 *    llega desde otro dominio, se guarda UNA vez en localStorage['spotz:acq']. La app vive en el mismo
 *    origen (enspotz.com/app), la lee al registrarse y la guarda en profiles.acquisition. Si ya había un
 *    primer contacto, no se pisa.
 * 2. Visitas: una llamada por pestaña y familia de página a la RPC record_landing_visit, que suma 1 al
 *    contador del día (landing_visits). Sin cookies, sin identificadores, sin IP. Se omite si el navegador
 *    pide no ser rastreado (Global Privacy Control o Do Not Track).
 *
 * Necesita window.SPOTZ (assets/spotz-config.js) cargado antes. Si la RPC aún no existe o falla, no pasa
 * nada: la página sigue igual. Política: privacidad.html §5.
 */
(function () {
  'use strict';
  var CLAVE = 'spotz:acq';

  function corto(v, n) { return String(v || '').trim().toLowerCase().slice(0, n); }
  function familia(path) {
    if (path === '/' || path === '') return '/';
    if (/^\/comercios/.test(path)) return '/comercios';
    if (/^\/event\//.test(path)) return '/event';
    if (/^\/local\//.test(path)) return '/local';
    if (/^\/terminos/.test(path)) return '/terminos';
    if (/^\/privacidad/.test(path)) return '/privacidad';
    return '/otro';
  }

  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  var acq = {
    src: corto(q.get('utm_source'), 64),
    medium: corto(q.get('utm_medium'), 64),
    campaign: corto(q.get('utm_campaign'), 64),
    content: corto(q.get('utm_content'), 64),
    ref: corto(q.get('ref'), 64),
    referrer_host: '',
    landing_path: String(location.pathname || '/').slice(0, 120),
    platform: 'web'
  };
  try {
    if (document.referrer) {
      var host = new URL(document.referrer).hostname.toLowerCase();
      // Sin "www." para que www.instagram.com e instagram.com cuenten juntos (igual que shared/lib/acquisition.ts).
      if (!/(^|\.)enspotz\.com$/.test(host)) acq.referrer_host = host.replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '').slice(0, 80);
    }
  } catch (e) { /* referrer ilegible: sin dato */ }

  // 1. Primer contacto: solo si trae algo útil y no había uno guardado.
  try {
    if ((acq.src || acq.ref || acq.referrer_host) && !localStorage.getItem(CLAVE)) {
      var guardar = { first_seen_at: new Date().toISOString() };
      for (var k in acq) if (acq[k]) guardar[k] = acq[k];
      localStorage.setItem(CLAVE, JSON.stringify(guardar));
    }
  } catch (e) { /* almacenamiento bloqueado: sin atribución */ }

  // 2. Conteo agregado de la visita.
  try {
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
    var fam = familia(location.pathname);
    var marca = 'spotz:visita:' + fam;
    if (sessionStorage.getItem(marca)) return;
    sessionStorage.setItem(marca, '1');
  } catch (e) { /* sin sessionStorage: se cuenta igual */ }

  var cfg = window.SPOTZ || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.fetch) return;
  try {
    fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/record_landing_visit', {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p: {
        path: familia(location.pathname),
        utm_source: acq.src, utm_medium: acq.medium, utm_campaign: acq.campaign,
        referrer_host: acq.referrer_host
      } })
    }).catch(function () { /* la RPC aún no existe o la red falló: nada que hacer */ });
  } catch (e) { /* sin fetch: nada que hacer */ }
})();

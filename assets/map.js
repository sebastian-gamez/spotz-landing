/* ============================================================================
 * map.js — el mapa de socios de la landing.
 *
 * Las constantes y los `paint` de las cuatro capas son COPIA VERBATIM de
 * Spotz/components/map/events-map.web.tsx, para que el mapa de la web y el de
 * la app sean el mismo objeto visual.
 *
 * Diferencias deliberadas respecto a la app:
 *   · `count` pasa de "eventos en el local" a "ofertas del socio".
 *   · Al tocar un pin no hay carrusel: se abre un popup que enlaza a /local/:id,
 *     que es la página con Open Graph propio y por tanto la compartible.
 *   · indexByVenue() desaparece: agrupaba eventos por local en el cliente, y
 *     public_partners() ya devuelve una fila por local. La agrupación se fue a
 *     Postgres, donde debía estar.
 *
 * CARGA DIFERIDA: mapbox-gl son ~250 KB gzip sobre una página que ya carga el
 * compilador de Tailwind en el hilo principal. Con 0 socios no se descarga
 * nada; con ≥1 se inyecta cuando la sección entra en viewport.
 * ========================================================================== */

;(function () {
  'use strict'

  var MAPBOX_VERSION = 'v3.9.0'
  var CHACAO_CENTER = [-66.855, 10.497]
  var DEFAULT_ZOOM = 12.5

  /** Espejo de Spotz/lib/map-clustering.ts:toGeoJSON. */
  function toGeoJSON(partners, selectedId) {
    return {
      type: 'FeatureCollection',
      features: partners
        .filter(function (p) { return Number.isFinite(p.lat) && Number.isFinite(p.lng) })
        .map(function (p) {
          return {
            type: 'Feature',
            id: p.id,
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
              venueId: p.id,
              name: p.name,
              count: (p.offers || []).length,
              selected: selectedId === p.id ? 1 : 0,
            },
          }
        }),
    }
  }

  function loadMapbox() {
    return new Promise(function (resolve, reject) {
      if (window.mapboxgl) return resolve(window.mapboxgl)

      var css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://api.mapbox.com/mapbox-gl-js/' + MAPBOX_VERSION + '/mapbox-gl.css'
      document.head.appendChild(css)

      var js = document.createElement('script')
      js.src = 'https://api.mapbox.com/mapbox-gl-js/' + MAPBOX_VERSION + '/mapbox-gl.js'
      js.onload = function () { resolve(window.mapboxgl) }
      js.onerror = function () { reject(new Error('mapbox-gl no cargó')) }
      document.head.appendChild(js)
    })
  }

  function popupHtml(p) {
    var lib = window.SpotzLib
    var offer = (p.offers || [])[0]
    var extra = (p.offers || []).length - 1
    var d = lib.resolveCardDesign(p.name, offer && offer.design)
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      })
    }

    var logo = d.logoUrl || p.logo_url
    var badge = logo
      ? '<img src="' + esc(logo) + '" alt="" style="width:34px;height:34px;border-radius:10px;object-fit:cover;flex-shrink:0">'
      : '<div style="width:34px;height:34px;border-radius:10px;flex-shrink:0;background:' +
        lib.cardBackground(d) + ';display:flex;align-items:center;justify-content:center;' +
        'font-weight:900;font-size:13px;color:' + d.textColor + '">' + esc(lib.initialsOf(p.name)) + '</div>'

    return '' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' + badge +
        '<div style="min-width:0">' +
          '<p style="font-weight:800;font-size:15px;margin:0;letter-spacing:-0.01em;color:#fff">' + esc(p.name) + '</p>' +
          '<p style="font-size:10px;color:rgba(255,255,255,0.45);margin:2px 0 0;letter-spacing:0.1em;text-transform:uppercase">' +
            esc([p.zona, p.category].filter(Boolean).join(' · ')) + '</p>' +
        '</div>' +
      '</div>' +
      (offer
        ? '<div style="background:rgba(255,107,53,0.10);border:1px solid rgba(255,107,53,0.25);border-radius:12px;padding:12px;margin-bottom:12px">' +
            '<p style="font-weight:800;font-size:14px;margin:0 0 2px;color:#fff">' + esc(offer.title) + '</p>' +
            '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0">' +
              (extra > 0 ? 'Y ' + extra + ' más · solo en spotz.online' : 'Solo en spotz.online') +
            '</p>' +
          '</div>'
        : '') +
      '<a href="/local/' + esc(p.id) + '" style="display:block;background:#FF6B35;border-radius:12px;padding:11px;' +
        'text-align:center;font-weight:800;font-size:13.5px;color:#fff;text-decoration:none">Ver la oferta →</a>'
  }

  /**
   * Monta el mapa. Solo se llama si hay al menos un socio.
   * @param {HTMLElement} container
   * @param {Array} partners  salida de public_partners()
   */
  /* El token vive en las variables de entorno de Vercel, no en el repo: el
   * escaneo de secretos de GitHub bloquea los tokens de Mapbox al hacer push.
   * Se pide UNA sola vez, y solo cuando ya hay socios que pintar — con el mapa
   * vacío no se hace ni esta petición. */
  var tokenPromise = null
  function getToken() {
    if (tokenPromise) return tokenPromise
    tokenPromise = fetch('/api/mapbox-token')
      .then(function (r) { return r.json() })
      .then(function (j) { return (j && j.token) || '' })
      .catch(function () { return '' })
    return tokenPromise
  }

  function mount(container, partners) {
    return getToken().then(function (token) {
      if (!token) {
        console.warn('[map] sin MAPBOX_TOKEN en el entorno: se queda el tablero estático')
        return null
      }
      return loadMapbox().then(function (mapboxgl) {
        mapboxgl.accessToken = token

      var map = new mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: CHACAO_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      })

      map.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          showUserHeading: true,
        }),
        'top-right'
      )

      map.on('load', function () {
        map.addSource('venues', {
          type: 'geojson',
          data: toGeoJSON(partners, null),
          cluster: true,
          // Con ≤20 pines el clustering parece innecesario y no lo es: Las
          // Mercedes y Chacao van a concentrar la mitad, y a zoom 12.5 se
          // solapan. 44 px ya está calibrado en la app.
          clusterRadius: 44,
          clusterMaxZoom: 14,
          clusterProperties: { sumCount: ['+', ['get', 'count']] },
        })

        map.addLayer({
          id: 'clusters', type: 'circle', source: 'venues', filter: ['has', 'point_count'],
          paint: {
            'circle-color': window.SpotzLib.PALETTE.accent,
            'circle-radius': ['step', ['get', 'sumCount'], 22, 5, 28, 20, 34],
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.5)',
          },
        })
        map.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'venues', filter: ['has', 'point_count'],
          layout: {
            'text-field': ['to-string', ['get', 'sumCount']],
            'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true,
          },
          paint: { 'text-color': window.SpotzLib.PALETTE.text },
        })

        map.addLayer({
          id: 'venue-circles', type: 'circle', source: 'venues', filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': window.SpotzLib.PALETTE.accent,
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 16, 10, 26],
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 2],
            'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1],
              window.SpotzLib.PALETTE.text, 'rgba(255,255,255,0.4)'],
          },
        })
        map.addLayer({
          id: 'venue-count', type: 'symbol', source: 'venues', filter: ['!', ['has', 'point_count']],
          layout: {
            // Sin allow-overlap a propósito: si dos números colisionan, mapbox
            // oculta uno en vez de amontonarlos. Igual que la app.
            'text-field': ['to-string', ['get', 'count']],
            'text-size': 13,
          },
          paint: { 'text-color': window.SpotzLib.PALETTE.text },
        })

        var byId = {}
        partners.forEach(function (p) { byId[p.id] = p })

        map.on('click', 'venue-circles', function (e) {
          var f = e.features && e.features[0]
          if (!f) return
          var p = byId[f.properties.venueId]
          if (!p) return
          new mapboxgl.Popup({ offset: 22, closeButton: false, maxWidth: '270px' })
            .setLngLat(f.geometry.coordinates.slice())
            .setHTML(popupHtml(p))
            .addTo(map)
        })

        map.on('click', 'clusters', function (e) {
          var f = e.features && e.features[0]
          if (!f) return
          map.getSource('venues').getClusterExpansionZoom(f.properties.cluster_id, function (err, zoom) {
            if (err) return
            map.easeTo({ center: f.geometry.coordinates, zoom: zoom })
          })
        })

        ;['venue-circles', 'clusters'].forEach(function (layer) {
          map.on('mouseenter', layer, function () { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = '' })
        })
      })

        return map
      })
    })
  }

  /** Monta cuando la sección entra en viewport, no antes. */
  function mountWhenVisible(section, container, partners) {
    if (!('IntersectionObserver' in window)) return mount(container, partners)

    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting })) {
        io.disconnect()
        mount(container, partners)
      }
    }, { rootMargin: '200px' })

    io.observe(section)
  }

  window.SpotzMap = { mount: mount, mountWhenVisible: mountWhenVisible, toGeoJSON: toGeoJSON }
})()

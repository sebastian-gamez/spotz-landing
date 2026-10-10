/* ============================================================================
 * /api/mapbox-token — sirve el token de Mapbox de la web.
 *
 * POR QUE NO ESTA EN EL REPO
 * Un token `pk.` de Mapbox esta pensado para ir en el cliente (asi funciona
 * cualquier mapa web), pero el escaneo de secretos de GitHub lo bloquea al
 * hacer push. Servirlo desde aqui resuelve tres cosas de golpe:
 *   1. No entra en el historial de git, asi que no hay nada que limpiar despues.
 *   2. Se rota desde el panel de Vercel, sin commit ni despliegue.
 *   3. El push deja de estar bloqueado.
 *
 * OJO, SIN ILUSIONES: esto NO convierte el token en secreto. Cualquiera puede
 * pedir esta URL y leerlo — igual que podria sacarlo del bundle de cualquier
 * mapa web del mundo. Lo que de verdad lo protege son las restricciones por
 * URL en account.mapbox.com y la alerta de facturacion.
 *
 * RESTRICCIONES DE URL EN MAPBOX — LO QUE HAY QUE SABER:
 * Mapbox NO admite comodines. Un `https://*.vercel.app/*` lo rechaza con
 * "Wildcard characters (*) are not supported in URL restrictions". Hay que
 * listar dominios exactos, uno a uno:
 *
 *   https://enspotz.com/
 *   https://www.enspotz.com/
 *   https://spotz.online/
 *
 * Consecuencia asumida: las previews de Vercel (URLs aleatorias por despliegue)
 * NO se pueden autorizar, asi que ahi el mapa sale en gris. Es esperado, no un
 * bug: se prueba en produccion.
 *
 * Configurar en Vercel: Settings -> Environment Variables -> MAPBOX_TOKEN
 * ========================================================================== */

module.exports = async function handler(req, res) {
  const token = String(process.env.MAPBOX_TOKEN || '').trim()

  res.setHeader('Content-Type', 'application/json')

  if (!token) {
    // 200 con token vacio, no 500: la landing degrada al tablero estatico, que
    // es un estado legitimo. Un error aqui no debe romper la pagina.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ token: '', configured: false })
  }

  // SOLO tokens publicos (`pk.`). Si alguien pega en MAPBOX_TOKEN un token
  // secreto (`sk.`, con permisos de escritura y de descarga) o uno temporal
  // (`tk.`), esta URL publica se lo regalaria a cualquiera. Se corta aqui, con
  // un error generico que no dice que token hay ni por que, y sin cache para
  // que el arreglo en el panel de Vercel se note al instante.
  if (!token.startsWith('pk.')) {
    console.error('[mapbox-token] MAPBOX_TOKEN no es un token publico (pk.); no se sirve')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(500).json({ error: 'server_error' })
  }

  // Cache larga: el token no cambia casi nunca.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json({ token, configured: true })
}

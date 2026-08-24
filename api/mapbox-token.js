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
 * Configurar en Vercel: Settings -> Environment Variables -> MAPBOX_TOKEN
 * ========================================================================== */

module.exports = async function handler(req, res) {
  const token = process.env.MAPBOX_TOKEN || ''

  // Cache larga: el token no cambia casi nunca, y `map.js` solo pide esto
  // cuando ya hay al menos un socio que pintar.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'application/json')

  if (!token) {
    // 200 con token vacio, no 500: la landing degrada al tablero estatico, que
    // es un estado legitimo. Un error aqui no debe romper la pagina.
    return res.status(200).json({ token: '', configured: false })
  }

  return res.status(200).json({ token, configured: true })
}

// Endpoint de eliminación de cuenta / datos — POST /api/delete-account
//
// Cumple el requisito de Google Play (URL pública de eliminación de cuenta).
//
// AUTENTICACIÓN: SOLO un access_token de Supabase, en `Authorization: Bearer`.
// Esta función NO recibe ni acepta contraseñas. La contraseña se comprueba en el
// navegador (eliminar-cuenta.html → signInWithPassword), donde Supabase aplica
// sus límites por IP a la IP real de quien prueba. Antes se verificaba aquí con
// el grant de password: todas las pruebas salían de las IP de Vercel y la acción
// 'verify' (200/401) servía para adivinar contraseñas sin límite. Se quitó.
//
// La función valida el token contra Supabase Auth (GET /auth/v1/user, lo mismo
// que auth.getUser(jwt)) y borra los datos del `id` que devuelve Supabase — el
// usuario del token, nunca uno que mande el cliente. La service_role NUNCA se
// expone: vive en la variable de entorno SUPABASE_SERVICE_ROLE_KEY de Vercel.
//
// Dos modos:
//   - mode "account": borra TODOS sus datos y elimina la cuenta de autenticación.
//   - mode "data":    borra navegación y gustos (event_views, favoritos, chats,
//                     intereses) pero CONSERVA la cuenta y el perfil base.
// En los dos hace falta `confirm: "Borrar"` (lo que el usuario escribe en el modal).
//
// Función serverless de Vercel (zero-config: cualquier archivo en /api).
// Usa fetch nativo (Node 18+), sin dependencias.

const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_supabase')

// Tablas con datos del usuario (columna user_id) que se borran al ELIMINAR LA CUENTA.
// Orden: hijos antes que padres para no chocar con llaves foráneas.
const ACCOUNT_TABLES = [
  'tickets', 'orders', 'notifications',
  'chat_request_log', 'chat_sessions', 'event_views', 'user_favorites',
]
// Subconjunto que se borra cuando solo se limpian DATOS (navegación + gustos),
// conservando la cuenta. No toca orders/tickets/notifications ni el perfil base.
// Ojo: `user_taste_profile` guarda lo que el asistente dedujo del usuario
// (presupuesto, con quién sale, zona, dieta) y se reinyecta en cada
// conversación. Sin borrarlo, "eliminar mis datos" dejaba justo lo más
// personal en su sitio.
const DATA_TABLES = [
  'chat_request_log', 'chat_sessions', 'event_views', 'user_favorites',
  'user_taste_profile',
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c; if (data.length > 8192) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

/** `Authorization: Bearer <jwt>` → el jwt, o '' si no viene bien formado. */
function bearer(req) {
  const h = String((req.headers && req.headers.authorization) || '')
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(h.trim())
  return m ? m[1] : ''
}

/**
 * Valida el access_token contra Supabase Auth y devuelve el id del usuario.
 * null = token inválido, caducado, revocado o sin usuario (la anon key, por
 * ejemplo, no tiene `sub`). Lanza si Supabase no responde.
 */
async function userIdFromToken(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (r.status === 401 || r.status === 403 || r.status === 404) return null
  if (!r.ok) throw new Error(`auth/v1/user ${r.status}`)
  const user = await r.json().catch(() => null)
  return user && typeof user.id === 'string' && UUID.test(user.id) ? user.id : null
}

async function svcDelete(serviceKey, table, userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
    },
  )
  // 404/relación inexistente no debe abortar todo el proceso.
  if (!r.ok && r.status !== 404 && r.status !== 406) {
    const t = await r.text().catch(() => '')
    throw new Error(`delete ${table}: ${r.status} ${t}`.slice(0, 300))
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'method_not_allowed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[delete-account] falta SUPABASE_SERVICE_ROLE_KEY')
    return send(res, 500, { error: 'server_error' })
  }

  // 1. El token. Sin token no se mira nada más: ni correo ni contraseña.
  const token = bearer(req)
  if (!token) return send(res, 401, { error: 'unauthorized' })

  let userId
  try {
    userId = await userIdFromToken(token)
  } catch (e) {
    console.error('[delete-account] auth no disponible:', e && e.message)
    return send(res, 502, { error: 'auth_unavailable' })
  }
  if (!userId) return send(res, 401, { error: 'unauthorized' })

  // 2. Confirmación explícita escribiendo "Borrar".
  const body = await readJsonBody(req)
  const mode = body.mode === 'data' ? 'data' : 'account'
  if (String(body.confirm || '').trim().toLowerCase() !== 'borrar') {
    return send(res, 400, { error: 'confirmation_required' })
  }

  // 3. Borrado, siempre del usuario del token.
  try {
    if (mode === 'data') {
      for (const t of DATA_TABLES) await svcDelete(serviceKey, t, userId)
      // Limpia los gustos/intereses del perfil, sin borrar la cuenta.
      const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ interests: null }),
      })
      if (!p.ok) console.error('[delete-account] profiles.interests:', p.status)
      return send(res, 200, { ok: true, mode: 'data' })
    }

    // mode === 'account': borra todos los datos, el perfil y la cuenta.
    for (const t of ACCOUNT_TABLES) await svcDelete(serviceKey, t, userId)
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=minimal' },
    })
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (!del.ok) {
      const t = await del.text().catch(() => '')
      console.error('[delete-account] admin delete user:', del.status, t.slice(0, 300))
      return send(res, 500, { error: 'deletion_failed' })
    }
    return send(res, 200, { ok: true, mode: 'account' })
  } catch (e) {
    console.error('[delete-account] borrado:', e && e.message)
    return send(res, 500, { error: 'deletion_failed' })
  }
}

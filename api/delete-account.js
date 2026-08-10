// Endpoint de eliminación de cuenta / datos — POST /api/delete-account
//
// Cumple el requisito de Google Play (URL pública de eliminación de cuenta).
// Verifica el correo + contraseña del usuario contra Supabase Auth y, solo si
// son correctos, borra sus datos con la service_role (que NUNCA se expone al
// cliente: vive en la variable de entorno SUPABASE_SERVICE_ROLE_KEY de Vercel).
//
// Dos modos:
//   - mode "account": borra TODOS sus datos y elimina la cuenta de autenticación.
//   - mode "data":    borra navegación y gustos (event_views, favoritos, chats,
//                     intereses) pero CONSERVA la cuenta y el perfil base.
//
// Función serverless de Vercel (zero-config: cualquier archivo en /api).
// Usa fetch nativo (Node 18+), sin dependencias.

const SUPABASE_URL = 'https://yifijgmmrdpafmeknind.supabase.co'
// anon key: pública (igual que en event.js / index.html), protegida por RLS.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmlqZ21tcmRwYWZtZWtuaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTAyNjksImV4cCI6MjA5MTUyNjI2OX0.YMvZAX8BD8h8EHZHuG4H9HR17REkaW9awnZPY4WYtG4'

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
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

// Valida correo+contraseña con el grant de password. Devuelve el id si es válido.
async function verifyCredentials(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) return null
  const data = await r.json().catch(() => null)
  return data && data.user && data.user.id ? data.user.id : null
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
    throw new Error(`delete ${table}: ${r.status} ${t}`.slice(0, 200))
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return send(res, 500, { error: 'server_not_configured' })

  const body = await readJsonBody(req)
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const action = body.action === 'delete' ? 'delete' : 'verify'
  const mode = body.mode === 'data' ? 'data' : 'account'

  if (!email || !password) return send(res, 400, { error: 'missing_credentials' })

  let userId
  try {
    userId = await verifyCredentials(email, password)
  } catch {
    return send(res, 502, { error: 'auth_unavailable' })
  }
  if (!userId) return send(res, 401, { error: 'invalid_credentials' })

  // Paso 1: solo validar (para mostrar el popup de confirmación en el front).
  if (action === 'verify') return send(res, 200, { ok: true })

  // Paso 2: confirmación explícita escribiendo "Borrar".
  if (String(body.confirm || '').trim().toLowerCase() !== 'borrar') {
    return send(res, 400, { error: 'confirmation_required' })
  }

  try {
    if (mode === 'data') {
      for (const t of DATA_TABLES) await svcDelete(serviceKey, t, userId)
      // Limpia los gustos/intereses del perfil, sin borrar la cuenta.
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ interests: null }),
      })
      return send(res, 200, { ok: true, mode: 'data' })
    }

    // mode === 'account": borra todos los datos, el perfil y la cuenta.
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
      return send(res, 500, { error: 'delete_user_failed', detail: t.slice(0, 200) })
    }
    return send(res, 200, { ok: true, mode: 'account' })
  } catch (e) {
    return send(res, 500, { error: 'deletion_failed', detail: String(e && e.message || e).slice(0, 200) })
  }
}

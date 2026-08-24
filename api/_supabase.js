/* ============================================================================
 * _supabase.js — configuración compartida por las funciones serverless.
 *
 * El prefijo `_` hace que Vercel NO enrute este archivo: /api/_supabase da 404.
 * Comprobarlo tras el primer despliegue.
 *
 * La anon key es pública por diseño y está protegida por RLS. La service_role
 * NUNCA vive aquí: solo en las variables de entorno de Vercel, y solo la lee
 * api/delete-account.js.
 * ========================================================================== */

const SUPABASE_URL = 'https://yifijgmmrdpafmeknind.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmlqZ21tcmRwYWZtZWtuaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTAyNjksImV4cCI6MjA5MTUyNjI2OX0.YMvZAX8BD8h8EHZHuG4H9HR17REkaW9awnZPY4WYtG4'

/** Cabeceras para hablar con PostgREST con la anon key. */
const anonHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}

/** Llama a una RPC de Postgres. Devuelve el JSON, o null si algo falla. */
async function rpc(name, body = {}) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...anonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY, anonHeaders, rpc }

/**
 * Frontend API wrapper — all Supabase calls go through /api/* proxy routes.
 * JWT lives in httpOnly cookies, never accessible to JavaScript.
 */

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  return res.json()
}

async function get(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
  })
  return res.json()
}

// ─── Auth ──────────────────────────────────────────

export async function apiLogin(email, password) {
  const result = await post('/api/auth/login', { email, password })
  if (result.error) throw new Error(result.error)
  return result.user
}

export async function apiLogout() {
  await post('/api/auth/logout', {})
}

export async function apiGetUser() {
  const result = await get('/api/auth/user')
  return result.user || null
}

export async function apiUpdatePassword(password) {
  const result = await post('/api/auth/update', { password })
  if (result.error) throw new Error(result.error)
  return result.user
}

// ─── Database ──────────────────────────────────────

/**
 * Generic DB query via proxy.
 * Returns { data, error, count }
 */
export async function dbQuery({
  table,
  operation = 'select',
  columns = '*',
  filters = [],
  data = undefined,
  options = undefined,
  order = undefined,
  range = undefined,
  limit = undefined,
}) {
  const result = await post('/api/db', {
    table, operation, columns, filters, data, options, order, range, limit,
  })
  if (result.error) {
    return { data: null, error: { message: result.error }, count: null }
  }
  return { data: result.data, error: null, count: result.count }
}

/**
 * Shorthand: SELECT from table with filters
 */
export async function dbSelect(table, { columns, filters, order, range, limit, single, maybeSingle } = {}) {
  const options = {}
  if (single) options.single = true
  if (maybeSingle) options.maybeSingle = true
  return dbQuery({ table, operation: 'select', columns, filters, order, range, limit, options })
}

/**
 * Shorthand: INSERT into table
 */
export async function dbInsert(table, data) {
  return dbQuery({ table, operation: 'insert', data })
}

/**
 * Shorthand: UPDATE table with filters
 */
export async function dbUpdate(table, data, filters) {
  return dbQuery({ table, operation: 'update', data, filters })
}

/**
 * Shorthand: DELETE from table with filters
 */
export async function dbDelete(table, filters) {
  return dbQuery({ table, operation: 'delete', filters })
}

/**
 * Shorthand: UPSERT into table
 */
export async function dbUpsert(table, data, options) {
  return dbQuery({ table, operation: 'upsert', data, options })
}

// ─── RPC ───────────────────────────────────────────

export async function rpcCall(fn, args) {
  const result = await post('/api/rpc', { fn, args })
  if (result.error) {
    return { data: null, error: { message: result.error } }
  }
  return { data: result.data, error: null }
}

// ─── Storage ───────────────────────────────────────

export async function storageUpload(bucket, path, blob, contentType) {
  const buffer = await blob.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )
  const result = await post('/api/storage', {
    bucket, operation: 'upload', path, fileBase64: base64, contentType,
  })
  if (result.error) return { data: null, error: { message: result.error } }
  return { data: { path: result.path }, error: null }
}

export async function storageCreateSignedUrl(bucket, path, expiresIn) {
  const result = await post('/api/storage', {
    bucket, operation: 'createSignedUrl', path, expiresIn,
  })
  if (result.error) return { data: null, error: { message: result.error } }
  return { data: { signedUrl: result.signedUrl }, error: null }
}

export async function storageRemove(bucket, paths) {
  const result = await post('/api/storage', {
    bucket, operation: 'remove', path: paths,
  })
  if (result.error) return { error: { message: result.error } }
  return { error: null }
}

import { createSupabaseFromRequest, applyCookies, json, error } from './_lib/supabase-server.mjs'

/**
 * Generic DB proxy — handles select, insert, update, delete, upsert operations.
 * RLS still enforces data access on the Supabase side.
 *
 * POST /api/db
 * Body: { table, operation, filters?, columns?, data?, options?, order?, range?, limit? }
 */

const ALLOWED_TABLES = [
  'clients', 'campaign_data', 'budgets', 'flight_days', 'ga4_kpi_data',
  'user_profiles', 'user_client_access', 'sheet_links', 'local_display_dashboard',
  'local_display_report', 'report_configs', 'report_history', 'alerts',
  'alert_configs', 'meta_config', 'gemius_config', 'sync_log'
]

const ALLOWED_OPERATIONS = ['select', 'insert', 'update', 'delete', 'upsert']

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { table, operation, filters, columns, data, options, order, range, limit } = req.body || {}

  if (!table || !operation) return error(res, 'table and operation required')
  if (!ALLOWED_TABLES.includes(table)) return error(res, `Table "${table}" not allowed`, 403)
  if (!ALLOWED_OPERATIONS.includes(operation)) return error(res, `Operation "${operation}" not allowed`, 403)

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)

  try {
    let query

    switch (operation) {
      case 'select': {
        query = supabase.from(table).select(columns || '*', options || {})
        break
      }
      case 'insert': {
        if (!data) return error(res, 'data required for insert')
        query = supabase.from(table).insert(data)
        break
      }
      case 'update': {
        if (!data) return error(res, 'data required for update')
        query = supabase.from(table).update(data)
        break
      }
      case 'delete': {
        query = supabase.from(table).delete()
        break
      }
      case 'upsert': {
        if (!data) return error(res, 'data required for upsert')
        query = supabase.from(table).upsert(data, options || {})
        break
      }
    }

    // Apply filters: [{ column, op, value }]
    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        switch (f.op) {
          case 'eq': query = query.eq(f.column, f.value); break
          case 'neq': query = query.neq(f.column, f.value); break
          case 'gt': query = query.gt(f.column, f.value); break
          case 'gte': query = query.gte(f.column, f.value); break
          case 'lt': query = query.lt(f.column, f.value); break
          case 'lte': query = query.lte(f.column, f.value); break
          case 'in': query = query.in(f.column, f.value); break
          case 'is': query = query.is(f.column, f.value); break
          default: return error(res, `Unknown filter op: ${f.op}`)
        }
      }
    }

    // Apply ordering: [{ column, ascending }]
    if (order && Array.isArray(order)) {
      for (const o of order) {
        query = query.order(o.column, { ascending: o.ascending ?? true })
      }
    }

    // Apply range (pagination)
    if (range) {
      query = query.range(range.from, range.to)
    }

    // Apply limit
    if (limit) {
      query = query.limit(limit)
    }

    // For single-row queries
    if (options?.single) {
      query = query.single()
    }
    if (options?.maybeSingle) {
      query = query.maybeSingle()
    }

    const result = await query

    applyCookies(res, cookieHeaders)
    json(res, { data: result.data, error: result.error?.message || null, count: result.count ?? null })
  } catch (err) {
    applyCookies(res, cookieHeaders)
    error(res, err.message, 500)
  }
}

import { createSupabaseFromRequest, applyCookies, json, error } from './_lib/supabase-server.mjs'

/**
 * Storage proxy — handles upload, signed URL, and delete operations.
 *
 * POST /api/storage
 * Body: { bucket, operation, path, expiresIn? }
 * For upload: Content-Type multipart/form-data with file field + bucket/path in query
 */

const ALLOWED_BUCKETS = ['reports']

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { bucket, operation, path, expiresIn } = req.body || {}

  if (!bucket || !operation || !path) return error(res, 'bucket, operation, and path required')
  if (!ALLOWED_BUCKETS.includes(bucket)) return error(res, `Bucket "${bucket}" not allowed`, 403)

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)

  try {
    let result

    switch (operation) {
      case 'createSignedUrl': {
        const { data, error: storageError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn || 31536000)
        if (storageError) {
          applyCookies(res, cookieHeaders)
          return error(res, storageError.message, 400)
        }
        result = { signedUrl: data.signedUrl }
        break
      }

      case 'remove': {
        const paths = Array.isArray(path) ? path : [path]
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove(paths)
        if (storageError) {
          applyCookies(res, cookieHeaders)
          return error(res, storageError.message, 400)
        }
        result = { ok: true }
        break
      }

      case 'upload': {
        // For upload, the file content is sent as base64 in the body
        const { fileBase64, contentType } = req.body
        if (!fileBase64) {
          applyCookies(res, cookieHeaders)
          return error(res, 'fileBase64 required for upload')
        }
        const buffer = Buffer.from(fileBase64, 'base64')
        const { data, error: storageError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, { contentType: contentType || 'application/pdf', upsert: true })
        if (storageError) {
          applyCookies(res, cookieHeaders)
          return error(res, storageError.message, 400)
        }
        result = { path: data.path }
        break
      }

      default:
        applyCookies(res, cookieHeaders)
        return error(res, `Unknown operation: ${operation}`)
    }

    applyCookies(res, cookieHeaders)
    json(res, result)
  } catch (err) {
    applyCookies(res, cookieHeaders)
    error(res, err.message, 500)
  }
}

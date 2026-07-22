const crypto = require("crypto")
const aiCacheModel = require("../models/aiCache.model")

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Build a stable cache key from a scope + any input object.
 * Same inputs always produce the same key, so repeat requests hit the cache.
 */
function buildKey(scope, input) {
    const normalized = JSON.stringify(input)
    const hash = crypto.createHash("sha256").update(normalized).digest("hex")
    return `${scope}:${hash}`
}

/**
 * Return a cached payload if present and unexpired; otherwise run `producer`,
 * cache its result, and return it. Cache read/write failures never break the
 * request — on any cache error we just fall back to computing the value.
 *
 * @param {string} scope     - logical bucket, e.g. "interview-report"
 * @param {Object} input     - the inputs that determine the output
 * @param {Function} producer - async fn that computes the value on a cache miss
 * @param {number} [ttlMs]   - time-to-live in ms
 * @returns {{ value: any, cached: boolean }}
 */
async function getOrSet(scope, input, producer, ttlMs = DEFAULT_TTL_MS) {
    const key = buildKey(scope, input)

    try {
        const hit = await aiCacheModel.findOne({ key })
        if (hit) {
            return { value: hit.payload, cached: true }
        }
    } catch (err) {
        console.warn(`[cache] read failed for ${scope}: ${err.message}`)
    }

    const value = await producer()

    try {
        await aiCacheModel.updateOne(
            { key },
            { key, scope, payload: value, expiresAt: new Date(Date.now() + ttlMs) },
            { upsert: true }
        )
    } catch (err) {
        console.warn(`[cache] write failed for ${scope}: ${err.message}`)
    }

    return { value, cached: false }
}

module.exports = { getOrSet, buildKey }

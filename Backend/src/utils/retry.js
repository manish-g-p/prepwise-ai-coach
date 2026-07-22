/**
 * Retry an async function with exponential backoff.
 * Used to make external calls (e.g. the Gemini API) resilient to transient
 * failures like rate limits (429), service unavailable (503), network blips,
 * or occasional malformed responses.
 *
 * @param {Function} fn - async function to run; receives the attempt number (1-based)
 * @param {Object} [options]
 * @param {number} [options.retries=3]   - max attempts before giving up
 * @param {number} [options.baseDelay=500] - base delay in ms (doubles each attempt)
 * @param {number} [options.maxDelay=8000] - cap on the delay between attempts
 * @param {Function} [options.shouldRetry] - (err) => boolean; decides if an error is retryable
 */
async function withRetry(fn, options = {}) {
    const {
        retries = 3,
        baseDelay = 500,
        maxDelay = 8000,
        shouldRetry = isRetryableError
    } = options

    let lastError

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn(attempt)
        } catch (err) {
            lastError = err

            const canRetry = attempt < retries && shouldRetry(err)
            if (!canRetry) break

            const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay)
            // small random jitter so parallel requests don't retry in lockstep
            const jitter = Math.floor(Math.random() * 250)
            console.warn(`[withRetry] attempt ${attempt} failed (${err.message}). retrying in ${delay + jitter}ms`)
            await sleep(delay + jitter)
        }
    }

    throw lastError
}

function isRetryableError(err) {
    const message = String(err?.message || "").toLowerCase()

    // A daily free-tier quota exhaustion won't recover within a request, so
    // retrying just wastes time — fail fast and let the caller show a clear message.
    if (message.includes("resource_exhausted") || message.includes("quota")) return false

    // HTTP status exposed by the GenAI SDK / fetch-style errors
    const status = err?.status || err?.code || err?.response?.status
    if ([ 408, 429, 500, 502, 503, 504 ].includes(Number(status))) return true

    return (
        message.includes("timeout") ||
        message.includes("etimedout") ||
        message.includes("econnreset") ||
        message.includes("network") ||
        message.includes("overloaded") ||
        message.includes("unavailable") ||
        message.includes("rate limit") ||
        // a malformed JSON body from the model is worth one more try
        message.includes("json")
    )
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { withRetry, isRetryableError }

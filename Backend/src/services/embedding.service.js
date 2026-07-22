const { GoogleGenAI } = require("@google/genai")
const { withRetry } = require("../utils/retry")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"

// The model returns 3072 dims by default. We request 768 to cut MongoDB storage
// ~4x, which matters on the free 512MB Atlas tier, with negligible quality loss
// for short-text similarity. Reduced-dimension vectors must be re-normalised.
const EMBEDDING_DIMS = 768

const EMBED_RETRY_OPTIONS = { retries: 4, baseDelay: 1500, maxDelay: 10000 }

/**
 * Embed a single piece of text into a normalised vector.
 * @returns {Promise<number[]>} unit-length vector of EMBEDDING_DIMS floats
 */
async function embedText(text) {
    const clean = String(text || "").trim()
    if (!clean) return null

    return withRetry(async () => {
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: clean,
            config: { outputDimensionality: EMBEDDING_DIMS }
        })

        const values = response.embeddings?.[ 0 ]?.values || response.embedding?.values
        if (!values || !values.length) throw new Error("Empty embedding response")

        return normalize(values)
    }, EMBED_RETRY_OPTIONS)
}

/**
 * Scale a vector to unit length so cosine similarity reduces to a dot product.
 */
function normalize(vector) {
    let sum = 0
    for (const v of vector) sum += v * v

    const magnitude = Math.sqrt(sum)
    if (!magnitude) return vector

    return vector.map(v => v / magnitude)
}

/**
 * Cosine similarity between two vectors. Both are expected to be normalised,
 * so this is a plain dot product in the range [-1, 1].
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0

    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[ i ] * b[ i ]

    return dot
}

module.exports = { embedText, cosineSimilarity, normalize, EMBEDDING_DIMS, EMBEDDING_MODEL }

const crypto = require("crypto")
const questionBankModel = require("../models/questionBank.model")
const { embedText, cosineSimilarity } = require("./embedding.service")

// How many candidate vectors to pull from Mongo before ranking in memory.
// Bounded so a growing bank never blows up request latency or memory.
const MAX_CANDIDATES = 500

function fingerprint(text) {
    return crypto.createHash("sha256").update(String(text).trim().toLowerCase()).digest("hex")
}

/**
 * Index a generated report's questions into the shared question bank.
 *
 * Runs best-effort in the background: a failure here must never break report
 * generation, so every error is swallowed and logged.
 *
 * @param {Object} report - the generated report (technical/behavioral questions + title)
 */
async function indexReportQuestions(report) {
    try {
        const role = report?.title || "General"

        const items = [
            ...(report?.technicalQuestions || []).map(q => ({ ...q, type: "technical" })),
            ...(report?.behavioralQuestions || []).map(q => ({ ...q, type: "behavioral" }))
        ].filter(q => q?.question)

        for (const item of items) {
            const fp = fingerprint(item.question)

            // Skip anything already in the bank (saves an embedding API call).
            const exists = await questionBankModel.exists({ fingerprint: fp })
            if (exists) continue

            const embedding = await embedText(item.question)
            if (!embedding) continue

            await questionBankModel.updateOne(
                { fingerprint: fp },
                {
                    fingerprint: fp,
                    question: item.question,
                    type: item.type,
                    intention: item.intention,
                    answer: item.answer,
                    role,
                    embedding
                },
                { upsert: true }
            )
        }
    } catch (err) {
        console.warn(`[rag] indexing failed: ${err.message}`)
    }
}

/**
 * Retrieve the questions most semantically similar to a job description.
 *
 * Embeds the query, pulls a bounded candidate set from MongoDB, then ranks by
 * cosine similarity in memory — a pragmatic vector search that stays free.
 *
 * @param {string} queryText - usually the job description
 * @param {number} k - how many questions to return
 * @param {number} minScore - discard weak matches below this similarity
 * @returns {Promise<Array>} ranked questions with their similarity score
 */
async function retrieveSimilarQuestions(queryText, k = 6, minScore = 0.55) {
    try {
        const queryVector = await embedText(queryText)
        if (!queryVector) return []

        const candidates = await questionBankModel
            .find({}, { question: 1, type: 1, role: 1, embedding: 1 })
            .sort({ createdAt: -1 })
            .limit(MAX_CANDIDATES)
            .lean()

        if (!candidates.length) return []

        return candidates
            .map(c => ({
                question: c.question,
                type: c.type,
                role: c.role,
                score: cosineSimilarity(queryVector, c.embedding)
            }))
            .filter(c => c.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
    } catch (err) {
        console.warn(`[rag] retrieval failed: ${err.message}`)
        return []
    }
}

/**
 * Render retrieved questions as a prompt fragment. Returns "" when the bank has
 * nothing relevant yet, so early runs simply behave as before.
 */
function buildRetrievalContext(retrieved) {
    if (!retrieved || !retrieved.length) return ""

    const lines = retrieved
        .map(r => `- [${r.type}] ${r.question}`)
        .join("\n")

    return `
                        For additional grounding, here are real questions previously generated for similar roles.
                        Use them to calibrate the style, depth and topic coverage of your questions.
                        Do NOT copy them verbatim — produce questions tailored to THIS candidate and job description:
${lines}
`
}

module.exports = { indexReportQuestions, retrieveSimilarQuestions, buildRetrievalContext }

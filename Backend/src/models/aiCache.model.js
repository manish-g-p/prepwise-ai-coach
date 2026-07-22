const mongoose = require("mongoose")

/**
 * Generic cache for expensive AI responses, keyed by a hash of the input.
 * A TTL index auto-deletes entries after `expiresAt`, so MongoDB acts as a
 * self-cleaning cache without needing a separate service like Redis.
 */
const aiCacheSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    scope: {
        // what kind of response this is, e.g. "interview-report"
        type: String,
        required: true
    },
    payload: {
        // the cached AI output (arbitrary JSON)
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
})

// TTL index: MongoDB removes the document once the current time passes expiresAt
aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model("AiCache", aiCacheSchema)

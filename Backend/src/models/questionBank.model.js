const mongoose = require("mongoose")

/**
 * A growing bank of interview questions, each stored with its embedding vector.
 *
 * This is the retrieval half of the RAG loop: every generated report feeds its
 * questions in here, and future generations retrieve semantically similar
 * questions to ground the model on what has actually been asked for similar
 * roles. Vectors live in MongoDB and similarity is computed in application
 * code, so no separate (paid) vector database is required.
 */
const questionBankSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [ "technical", "behavioral" ],
        required: true
    },
    intention: String,
    answer: String,
    // Job title / role the question was generated for, used for display + filtering.
    role: {
        type: String,
        index: true
    },
    embedding: {
        type: [ Number ],
        required: true
    },
    // Hash of the question text, so the same question is not indexed twice.
    fingerprint: {
        type: String,
        required: true,
        unique: true,
        index: true
    }
}, {
    timestamps: true
})

module.exports = mongoose.model("QuestionBank", questionBankSchema)

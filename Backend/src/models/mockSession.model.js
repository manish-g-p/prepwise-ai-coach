const mongoose = require("mongoose")

/**
 * One question/answer exchange within a mock interview.
 * `answer` and the evaluation fields stay empty until the candidate responds.
 */
const mockTurnSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    intention: String,
    type: {
        type: String,
        enum: [ "technical", "behavioral" ],
        default: "technical"
    },
    answer: String,
    answeredAt: Date,
    score: {
        type: Number,
        min: 0,
        max: 100
    },
    verdict: {
        type: String,
        enum: [ "strong", "good", "needs-work", "poor" ]
    },
    strengths: [ String ],
    improvements: [ String ],
    missedPoints: [ String ],
    modelAnswer: String
}, {
    _id: false
})

const mockSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true,
        index: true
    },
    interviewReport: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InterviewReport",
        required: true
    },
    jobTitle: String,
    jobDescription: String,
    turns: [ mockTurnSchema ],
    // Index of the turn currently awaiting an answer.
    currentTurn: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: [ "in-progress", "completed" ],
        default: "in-progress"
    },
    // Average of all answered turn scores, filled in when the session completes.
    overallScore: Number
}, {
    timestamps: true
})

module.exports = mongoose.model("MockSession", mockSessionSchema)

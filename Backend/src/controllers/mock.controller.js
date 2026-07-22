const mockSessionModel = require("../models/mockSession.model")
const interviewReportModel = require("../models/interviewReport.model")
const { evaluateAnswer } = require("../services/ai.service")
const { retrieveSimilarQuestions } = require("../services/rag.service")

const MAX_QUESTIONS = 5

/**
 * Strip evaluation details from a turn the candidate has not answered yet, so
 * the model answer is never leaked to the client before they respond.
 */
function publicSession(session) {
    const obj = session.toObject ? session.toObject() : session

    obj.turns = obj.turns.map((turn, i) => {
        if (i > obj.currentTurn || (i === obj.currentTurn && !turn.answer)) {
            return { question: turn.question, type: turn.type, answered: false }
        }
        return { ...turn, answered: Boolean(turn.answer) }
    })

    return obj
}

/**
 * @description Start a mock interview for a given report. Builds the question
 * set from the report, topped up with semantically similar questions from the
 * RAG question bank so sessions vary beyond the report's own questions.
 */
async function startMockSessionController(req, res) {
    const { interviewReportId } = req.params

    const report = await interviewReportModel.findOne({ _id: interviewReportId, user: req.user.id })

    if (!report) {
        return res.status(404).json({ message: "Interview report not found." })
    }

    const fromReport = [
        ...(report.technicalQuestions || []).map(q => ({ question: q.question, intention: q.intention, type: "technical" })),
        ...(report.behavioralQuestions || []).map(q => ({ question: q.question, intention: q.intention, type: "behavioral" }))
    ]

    // Pull in related questions from the shared bank (RAG) for variety.
    const retrieved = await retrieveSimilarQuestions(report.jobDescription, 4)

    const seen = new Set(fromReport.map(q => q.question.trim().toLowerCase()))
    const extras = retrieved
        .filter(r => !seen.has(r.question.trim().toLowerCase()))
        .map(r => ({ question: r.question, intention: "", type: r.type }))

    const turns = shuffle([ ...fromReport, ...extras ]).slice(0, MAX_QUESTIONS)

    if (!turns.length) {
        return res.status(400).json({ message: "This report has no questions to practise with." })
    }

    const session = await mockSessionModel.create({
        user: req.user.id,
        interviewReport: report._id,
        jobTitle: report.title,
        jobDescription: report.jobDescription,
        turns,
        currentTurn: 0
    })

    res.status(201).json({
        message: "Mock interview started.",
        session: publicSession(session)
    })
}

/**
 * @description Submit an answer for the current question, get it scored, and
 * advance to the next question (or complete the session).
 */
async function submitAnswerController(req, res) {
    const { sessionId } = req.params
    const { answer } = req.body

    if (typeof answer !== "string" || !answer.trim()) {
        return res.status(400).json({ message: "Please provide an answer." })
    }

    const session = await mockSessionModel.findOne({ _id: sessionId, user: req.user.id })

    if (!session) {
        return res.status(404).json({ message: "Mock session not found." })
    }

    if (session.status === "completed") {
        return res.status(400).json({ message: "This mock interview is already complete." })
    }

    const turn = session.turns[ session.currentTurn ]

    if (!turn) {
        return res.status(400).json({ message: "No question is awaiting an answer." })
    }

    const evaluation = await evaluateAnswer({
        question: turn.question,
        intention: turn.intention,
        answer,
        jobDescription: session.jobDescription
    })

    turn.answer = answer
    turn.answeredAt = new Date()
    turn.score = evaluation.score
    turn.verdict = evaluation.verdict
    turn.strengths = evaluation.strengths
    turn.improvements = evaluation.improvements
    turn.missedPoints = evaluation.missedPoints
    turn.modelAnswer = evaluation.modelAnswer

    const isLast = session.currentTurn >= session.turns.length - 1

    if (isLast) {
        session.status = "completed"
        const scored = session.turns.filter(t => typeof t.score === "number")
        session.overallScore = scored.length
            ? Math.round(scored.reduce((sum, t) => sum + t.score, 0) / scored.length)
            : 0
    } else {
        session.currentTurn += 1
    }

    await session.save()

    res.status(200).json({
        message: "Answer evaluated.",
        evaluation,
        session: publicSession(session)
    })
}

/**
 * @description Get a mock session by id.
 */
async function getMockSessionController(req, res) {
    const { sessionId } = req.params

    const session = await mockSessionModel.findOne({ _id: sessionId, user: req.user.id })

    if (!session) {
        return res.status(404).json({ message: "Mock session not found." })
    }

    res.status(200).json({ session: publicSession(session) })
}

function shuffle(items) {
    const arr = [ ...items ]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ arr[ i ], arr[ j ] ] = [ arr[ j ], arr[ i ] ]
    }
    return arr
}

module.exports = { startMockSessionController, submitAnswerController, getMockSessionController }

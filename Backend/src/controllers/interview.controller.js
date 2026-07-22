const pdfParse = require("pdf-parse")
const { generateInterviewReport, streamInterviewReport, generateResumePdf } = require("../services/ai.service")
const interviewReportModel = require("../models/interviewReport.model")
const { getOrSet, buildKey } = require("../utils/cache")
const aiCacheModel = require("../models/aiCache.model")
const { indexReportQuestions, retrieveSimilarQuestions, buildRetrievalContext } = require("../services/rag.service")

/**
 * Turn a raw AI/provider error into a short, user-safe message.
 */
function friendlyAiError(err) {
    const raw = String(err?.message || "")
    if (/quota|resource_exhausted/i.test(raw) || err?.status === 429) {
        return "The free daily AI request limit has been reached. Please try again later."
    }
    if (/high demand|unavailable|overloaded/i.test(raw)) {
        return "The AI service is busy right now. Please try again in a moment."
    }
    return "Something went wrong while generating your report. Please try again."
}

/**
 * Extract text from an uploaded resume PDF. Returns "" when no file was sent
 * (the UI allows generating from a self-description alone).
 */
async function extractResumeText(file) {
    if (!file) return ""
    const parsed = await (new pdfParse.PDFParse(Uint8Array.from(file.buffer))).getText()
    return parsed.text || ""
}




/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterViewReportController(req, res) {

    const { selfDescription, jobDescription } = req.body

    const resumeText = await extractResumeText(req.file)

    if (!resumeText && !selfDescription) {
        return res.status(400).json({ message: "Please provide a resume or a self description." })
    }

    // RAG: ground generation on semantically similar questions from the bank.
    const retrieved = await retrieveSimilarQuestions(jobDescription)
    const retrievalContext = buildRetrievalContext(retrieved)

    // Cache on the exact inputs — regenerating the same resume + JD reuses the
    // AI result instead of spending another (free-tier limited) API call.
    const { value: interViewReportByAi, cached } = await getOrSet(
        "interview-report",
        { resume: resumeText, selfDescription, jobDescription },
        () => generateInterviewReport({ resume: resumeText, selfDescription, jobDescription, retrievalContext })
    )

    // Feed the new questions back into the bank (best effort, non-blocking).
    if (!cached) indexReportQuestions(interViewReportByAi)

    const interviewReport = await interviewReportModel.create({
        user: req.user.id,
        resume: resumeText,
        selfDescription,
        jobDescription,
        ...interViewReportByAi
    })

    res.status(201).json({
        message: cached
            ? "Interview report generated successfully (served from cache)."
            : "Interview report generated successfully.",
        interviewReport
    })

}

/**
 * @description Streaming version of report generation. Streams the AI output to
 * the client over Server-Sent Events (SSE) so the UI can render the report as it
 * is produced, then saves it and emits a final "done" event with the saved doc.
 */
async function streamInterViewReportController(req, res) {

    // ── SSE handshake ──
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
    })
    res.flushHeaders?.()

    const send = (type, data = {}) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    }

    // Stop generating if the client navigates away / closes the tab.
    let clientGone = false
    req.on("close", () => { clientGone = true })

    try {
        const { selfDescription, jobDescription } = req.body
        const resumeText = await extractResumeText(req.file)

        if (!resumeText && !selfDescription) {
            send("error", { message: "Please provide a resume or a self description." })
            return
        }

        const cacheInput = { resume: resumeText, selfDescription, jobDescription }
        const cacheKey = buildKey("interview-report", cacheInput)

        let reportData
        const cachedEntry = await aiCacheModel.findOne({ key: cacheKey })

        if (cachedEntry) {
            // Cache hit: nothing to stream, just reuse the stored result.
            send("status", { message: "Found a cached analysis — loading instantly." })
            reportData = cachedEntry.payload
        } else {
            send("status", { message: "Searching similar interview questions..." })

            // RAG: ground generation on semantically similar questions from the bank.
            const retrieved = await retrieveSimilarQuestions(jobDescription)
            const retrievalContext = buildRetrievalContext(retrieved)

            send("status", {
                message: retrieved.length
                    ? `Found ${retrieved.length} related questions. Analyzing your profile...`
                    : "Analyzing your resume and the job description..."
            })

            reportData = await streamInterviewReport({ ...cacheInput, retrievalContext }, (delta) => {
                if (!clientGone) send("chunk", { text: delta })
            })

            // Cache for next time (best effort — don't fail the request on cache write).
            try {
                await aiCacheModel.updateOne(
                    { key: cacheKey },
                    { key: cacheKey, scope: "interview-report", payload: reportData, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
                    { upsert: true }
                )
            } catch (err) {
                console.warn(`[cache] write failed: ${err.message}`)
            }

            // Feed the new questions back into the bank (best effort, non-blocking).
            indexReportQuestions(reportData)
        }

        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeText,
            selfDescription,
            jobDescription,
            ...reportData
        })

        send("done", { interviewReport })
    } catch (err) {
        console.error("[stream] error:", err)
        send("error", { message: friendlyAiError(err) })
    } finally {
        res.end()
    }
}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {

    const { interviewId } = req.params

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report fetched successfully.",
        interviewReport
    })
}


/** 
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}


/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res) {
    const { interviewReportId } = req.params

    const interviewReport = await interviewReportModel.findOne({ _id: interviewReportId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    const { resume, jobDescription, selfDescription } = interviewReport

    const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

    res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`
    })

    res.send(pdfBuffer)
}

module.exports = { generateInterViewReportController, streamInterViewReportController, getInterviewReportByIdController, getAllInterviewReportsController, generateResumePdfController }
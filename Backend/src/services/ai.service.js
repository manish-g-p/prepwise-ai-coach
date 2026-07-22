const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")
const { withRetry } = require("../utils/retry")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

// Model is configurable via env so it's easy to swap without code changes.
// Default to gemini-flash-lite-latest: flash-lite gets the most generous
// free-tier daily limits (best for a free, multi-user deployment), it's fast,
// supports structured output + streaming, and "latest" auto-follows the current
// lite model so it won't break when a specific version is retired. Some stable
// models (e.g. gemini-2.0/2.5-flash) have a 0 free-tier quota for new API keys.
// Override with GEMINI_MODEL in .env to pin a specific version.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest"

// The model can hit sustained "503 high demand" spells, so give the AI calls a
// patient retry budget (longer backoff, more attempts).
const AI_RETRY_OPTIONS = { retries: 6, baseDelay: 2000, maxDelay: 15000 }


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    learningResources: z.object({
        githubRepos: z.array(z.object({
            name: z.string().describe("Full name of the GitHub repository in owner/repo format, e.g. 'trekhleb/javascript-algorithms'"),
            url: z.string().describe("Canonical GitHub URL, e.g. https://github.com/owner/repo. Only use famous, real, widely-starred repositories you are confident exist."),
            reason: z.string().describe("Why this repository is useful for THIS specific job description")
        })).describe("3-5 well-known, high-star GitHub repositories relevant to the job's tech stack. Must be real, popular repos - do not invent repositories."),
        youtubeChannels: z.array(z.object({
            name: z.string().describe("Name of the YouTube channel or specific playlist, e.g. 'freeCodeCamp.org', 'Fireship', 'Hitesh Choudhary'"),
            url: z.string().describe("URL to the channel or playlist. Only reference well-known channels you are confident exist."),
            reason: z.string().describe("What the candidate should learn from it for this job")
        })).describe("3-5 popular, real YouTube channels or playlists relevant to the job. Do not invent channels or fabricate video URLs."),
        roadmaps: z.array(z.object({
            title: z.string().describe("Title of the roadmap, e.g. 'Backend Developer Roadmap', 'Frontend Developer Roadmap'"),
            url: z.string().describe("URL of the roadmap. Strongly prefer roadmap.sh paths like https://roadmap.sh/backend when applicable."),
            reason: z.string().describe("Why following this roadmap helps for this job")
        })).describe("1-3 learning roadmaps relevant to the role. Prefer roadmap.sh for canonical, real URLs.")
    }).describe("Curated, REAL and popular learning resources (GitHub repos, YouTube channels, roadmaps) tailored to the job description. Never fabricate URLs - only reference resources you are highly confident actually exist."),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

function buildReportPrompt({ resume, selfDescription, jobDescription, retrievalContext = "" }) {
    return `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
${retrievalContext}
                        For the learningResources section, only recommend real, popular, widely-known GitHub repositories, YouTube channels, and roadmaps that you are highly confident actually exist. Prefer canonical URLs (e.g. roadmap.sh for roadmaps, github.com/owner/repo for repos). Never invent repository names, channel URLs, or video links. Tailor every resource to the technologies mentioned in the job description.
`
}

const reportGenerationConfig = {
    responseMimeType: "application/json",
    responseSchema: zodToJsonSchema(interviewReportSchema),
}

async function generateInterviewReport({ resume, selfDescription, jobDescription, retrievalContext }) {

    const prompt = buildReportPrompt({ resume, selfDescription, jobDescription, retrievalContext })

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: reportGenerationConfig
        })

        // JSON.parse throws on a malformed body; withRetry treats that as retryable
        return JSON.parse(response.text)
    }, AI_RETRY_OPTIONS)

}

/**
 * Stream the interview report as the model generates it.
 * Calls `onText(deltaText, fullText)` for each chunk, and resolves to the final
 * parsed report object. The initial connection is retried on transient errors
 * (e.g. 503 high demand) before any streaming begins.
 */
async function streamInterviewReport({ resume, selfDescription, jobDescription, retrievalContext }, onText) {

    const prompt = buildReportPrompt({ resume, selfDescription, jobDescription, retrievalContext })

    // Retry only the setup call; once chunks start flowing we don't restart.
    const stream = await withRetry(() => ai.models.generateContentStream({
        model: MODEL,
        contents: prompt,
        config: reportGenerationConfig
    }), AI_RETRY_OPTIONS)

    let fullText = ""
    for await (const chunk of stream) {
        const delta = chunk.text || ""
        if (!delta) continue
        fullText += delta
        if (onText) onText(delta, fullText)
    }

    return JSON.parse(fullText)
}


// ── Mock interview: answer evaluation ────────────────────────────────────────

const answerEvaluationSchema = z.object({
    score: z.number().describe("A score from 0 to 100 rating how good the candidate's answer is for this question in a real interview"),
    verdict: z.enum([ "strong", "good", "needs-work", "poor" ]).describe("A short overall verdict on the answer quality"),
    strengths: z.array(z.string()).describe("2-4 specific things the candidate did well in their answer. If the answer is empty or nonsense, return an empty array."),
    improvements: z.array(z.string()).describe("2-4 specific, actionable things the candidate should improve or should have mentioned"),
    missedPoints: z.array(z.string()).describe("Key technical points or keywords an interviewer would expect but the candidate did not mention"),
    modelAnswer: z.string().describe("A concise, strong example answer (5-8 sentences) the candidate can learn from, written in first person as the candidate would say it")
})

/**
 * Evaluate a candidate's answer to a single mock-interview question.
 */
async function evaluateAnswer({ question, intention, answer, jobDescription }) {

    const prompt = `You are a strict but fair senior technical interviewer.
                        Evaluate the candidate's answer to the interview question below.

                        Job Description: ${jobDescription}
                        Question: ${question}
                        What the interviewer is really testing: ${intention || "general competence"}
                        Candidate's Answer: ${answer}

                        Score honestly. An empty, irrelevant, or nonsense answer must score below 15 with no invented strengths.
                        Be specific and reference what the candidate actually said. Keep all feedback actionable.
`

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(answerEvaluationSchema),
            }
        })

        return JSON.parse(response.text)
    }, AI_RETRY_OPTIONS)
}


async function generatePdfFromHtml(htmlContent) {
    // In a container we run as a non-root user against the system Chromium, so
    // the Chrome sandbox must be disabled and /dev/shm avoided (it is tiny in
    // Docker and causes crashes on memory-constrained free hosting tiers).
    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    })
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const jsonContent = await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(resumePdfSchema),
            }
        })

        return JSON.parse(response.text)
    }, AI_RETRY_OPTIONS)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, streamInterviewReport, evaluateAnswer, generateResumePdf }
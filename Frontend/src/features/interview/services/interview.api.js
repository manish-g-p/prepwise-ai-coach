import axios from "axios";
import { API_BASE_URL } from "../../../config/api.config";

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
})


/**
 * @description Service to generate interview report based on user self description, resume and job description.
 */
export const generateInterviewReport = async ({ jobDescription, selfDescription, resumeFile }) => {

    const formData = new FormData()
    formData.append("jobDescription", jobDescription)
    formData.append("selfDescription", selfDescription)
    formData.append("resume", resumeFile)

    const response = await api.post("/api/interview/", formData, {
        headers: {
            "Content-Type": "multipart/form-data"
        }
    })

    return response.data

}


/**
 * @description Streaming report generation. POSTs the resume + job description and
 * reads the Server-Sent Events response, invoking callbacks as data arrives.
 *
 * We use fetch() (not EventSource) because we need to POST a multipart body with
 * a file, which EventSource cannot do.
 *
 * @param {Object} payload - { jobDescription, selfDescription, resumeFile }
 * @param {Object} handlers - { onStatus, onChunk, onDone, onError }
 */
export const generateInterviewReportStream = async ({ jobDescription, selfDescription, resumeFile }, handlers = {}) => {
    const { onStatus, onChunk, onDone, onError } = handlers

    const formData = new FormData()
    formData.append("jobDescription", jobDescription)
    formData.append("selfDescription", selfDescription)
    if (resumeFile) formData.append("resume", resumeFile)

    const response = await fetch(`${API_BASE_URL}/api/interview/stream`, {
        method: "POST",
        credentials: "include",
        body: formData
    })

    if (!response.ok || !response.body) {
        onError?.({ message: "Failed to start report generation." })
        return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n")
        buffer = frames.pop() // keep the last, possibly-incomplete frame

        for (const frame of frames) {
            const line = frame.split("\n").find(l => l.startsWith("data:"))
            if (!line) continue

            let event
            try {
                event = JSON.parse(line.slice(5).trim())
            } catch {
                continue
            }

            if (event.type === "status") onStatus?.(event.message)
            else if (event.type === "chunk") onChunk?.(event.text)
            else if (event.type === "done") onDone?.(event.interviewReport)
            else if (event.type === "error") onError?.({ message: event.message })
        }
    }
}


/**
 * @description Service to get interview report by interviewId.
 */
export const getInterviewReportById = async (interviewId) => {
    const response = await api.get(`/api/interview/report/${interviewId}`)

    return response.data
}


/**
 * @description Service to get all interview reports of logged in user.
 */
export const getAllInterviewReports = async () => {
    const response = await api.get("/api/interview/")

    return response.data
}


/**
 * @description Service to generate resume pdf based on user self description, resume content and job description.
 */
export const generateResumePdf = async ({ interviewReportId }) => {
    const response = await api.post(`/api/interview/resume/pdf/${interviewReportId}`, null, {
        responseType: "blob"
    })

    return response.data
}
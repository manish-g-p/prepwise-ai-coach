import axios from "axios"
import { API_BASE_URL } from "../../../config/api.config"

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
})

/**
 * @description Start a mock interview session for a given interview report.
 */
export const startMockSession = async (interviewReportId) => {
    const response = await api.post(`/api/mock/start/${interviewReportId}`)
    return response.data
}

/**
 * @description Submit an answer for the current question and get it scored.
 */
export const submitMockAnswer = async (sessionId, answer) => {
    const response = await api.post(`/api/mock/${sessionId}/answer`, { answer })
    return response.data
}

/**
 * @description Fetch an existing mock interview session.
 */
export const getMockSession = async (sessionId) => {
    const response = await api.get(`/api/mock/${sessionId}`)
    return response.data
}

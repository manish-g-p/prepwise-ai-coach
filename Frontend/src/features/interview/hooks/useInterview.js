import { getAllInterviewReports, generateInterviewReport, generateInterviewReportStream, getInterviewReportById, generateResumePdf } from "../services/interview.api"
import { useContext, useEffect } from "react"
import { InterviewContext, emptyStream } from "../interview.context"
import { useParams } from "react-router"
import { parsePartialJson } from "../utils/parsePartialJson"


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider")
    }

    const { loading, setLoading, report, setReport, reports, setReports, stream, setStream } = context

    const generateReport = async ({ jobDescription, selfDescription, resumeFile }) => {
        setLoading(true)
        let response = null
        try {
            response = await generateInterviewReport({ jobDescription, selfDescription, resumeFile })
            setReport(response.interviewReport)
        } catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }

        return response.interviewReport
    }

    const generateReportStream = async ({ jobDescription, selfDescription, resumeFile }) => {
        setStream({ active: true, status: "Starting...", partial: null, error: null })

        let accumulated = ""
        let finalReport = null

        await generateInterviewReportStream(
            { jobDescription, selfDescription, resumeFile },
            {
                onStatus: (message) => {
                    setStream(s => ({ ...s, status: message }))
                },
                onChunk: (text) => {
                    accumulated += text
                    const partial = parsePartialJson(accumulated)
                    setStream(s => ({ ...s, status: "Generating your interview plan...", partial: partial || s.partial }))
                },
                onDone: (interviewReport) => {
                    finalReport = interviewReport
                    setReport(interviewReport)
                    setStream({ ...emptyStream })
                },
                onError: (err) => {
                    setStream(s => ({ ...s, active: false, error: err.message }))
                }
            }
        )

        return finalReport
    }

    const getReportById = async (interviewId) => {
        setLoading(true)
        let response = null
        try {
            response = await getInterviewReportById(interviewId)
            setReport(response.interviewReport)
        } catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }
        return response.interviewReport
    }

    const getReports = async () => {
        setLoading(true)
        let response = null
        try {
            response = await getAllInterviewReports()
            setReports(response.interviewReports)
        } catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }

        return response.interviewReports
    }

    const getResumePdf = async (interviewReportId) => {
        setLoading(true)
        let response = null
        try {
            response = await generateResumePdf({ interviewReportId })
            const url = window.URL.createObjectURL(new Blob([ response ], { type: "application/pdf" }))
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", `resume_${interviewReportId}.pdf`)
            document.body.appendChild(link)
            link.click()
        }
        catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [ interviewId ])

    return { loading, report, reports, stream, setStream, generateReport, generateReportStream, getReportById, getReports, getResumePdf }

}
import { createContext,useState } from "react";


export const InterviewContext = createContext()

const emptyStream = { active: false, status: "", partial: null, error: null }

export const InterviewProvider = ({ children }) => {
    const [loading, setLoading] = useState(false)
    const [report, setReport] = useState(null)
    const [reports, setReports] = useState([])
    const [stream, setStream] = useState(emptyStream)

    return (
        <InterviewContext.Provider value={{ loading, setLoading, report, setReport, reports, setReports, stream, setStream }}>
            {children}
        </InterviewContext.Provider>
    )
}

export { emptyStream }
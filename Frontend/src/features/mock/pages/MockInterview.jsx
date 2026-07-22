import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { startMockSession, submitMockAnswer } from '../services/mock.api'
import '../style/mock.scss'

const verdictLabel = {
    strong: 'Strong answer',
    good: 'Good answer',
    'needs-work': 'Needs work',
    poor: 'Poor answer'
}

const scoreClass = (score) =>
    score >= 80 ? 'score--high' : score >= 50 ? 'score--mid' : 'score--low'

const FeedbackPanel = ({ evaluation }) => (
    <div className='mock-feedback'>
        <div className='mock-feedback__head'>
            <span className={`mock-score ${scoreClass(evaluation.score)}`}>{evaluation.score}</span>
            <span className='mock-verdict'>{verdictLabel[ evaluation.verdict ] || evaluation.verdict}</span>
        </div>

        {evaluation.strengths?.length > 0 && (
            <div className='mock-feedback__section'>
                <h4 className='mock-feedback__title mock-feedback__title--good'>What you did well</h4>
                <ul>{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
        )}

        {evaluation.improvements?.length > 0 && (
            <div className='mock-feedback__section'>
                <h4 className='mock-feedback__title mock-feedback__title--warn'>How to improve</h4>
                <ul>{evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
        )}

        {evaluation.missedPoints?.length > 0 && (
            <div className='mock-feedback__section'>
                <h4 className='mock-feedback__title mock-feedback__title--miss'>Points you missed</h4>
                <ul>{evaluation.missedPoints.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
        )}

        {evaluation.modelAnswer && (
            <div className='mock-feedback__section'>
                <h4 className='mock-feedback__title'>Model answer</h4>
                <p className='mock-model-answer'>{evaluation.modelAnswer}</p>
            </div>
        )}
    </div>
)

const MockInterview = () => {
    const { interviewId } = useParams()
    const navigate = useNavigate()

    const [ session, setSession ] = useState(null)
    const [ answer, setAnswer ] = useState('')
    const [ evaluation, setEvaluation ] = useState(null)
    const [ loading, setLoading ] = useState(true)
    const [ submitting, setSubmitting ] = useState(false)
    const [ error, setError ] = useState(null)

    useEffect(() => {
        let cancelled = false

        const start = async () => {
            try {
                const data = await startMockSession(interviewId)
                if (!cancelled) setSession(data.session)
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.message || 'Could not start the mock interview.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        start()
        return () => { cancelled = true }
    }, [ interviewId ])

    const handleSubmit = async () => {
        if (!answer.trim() || submitting) return

        setSubmitting(true)
        setError(null)

        try {
            const data = await submitMockAnswer(session._id, answer)
            setEvaluation(data.evaluation)
            setSession(data.session)
        } catch (err) {
            setError(err.response?.data?.message || 'Could not evaluate your answer. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const handleNext = () => {
        setEvaluation(null)
        setAnswer('')
    }

    if (loading) {
        return <main className='mock-screen'><div className='mock-card'><h1>Setting up your mock interview…</h1></div></main>
    }

    if (error && !session) {
        return (
            <main className='mock-screen'>
                <div className='mock-card'>
                    <h1>Could not start</h1>
                    <p className='mock-muted'>{error}</p>
                    <button className='mock-btn' onClick={() => navigate(`/interview/${interviewId}`)}>Back to report</button>
                </div>
            </main>
        )
    }

    const isComplete = session.status === 'completed' && evaluation === null
    const total = session.turns.length
    const currentIndex = session.currentTurn
    const currentQuestion = session.turns[ currentIndex ]?.question

    // Final summary once every question has been answered and reviewed.
    if (session.status === 'completed' && evaluation === null) {
        return (
            <main className='mock-screen'>
                <div className='mock-card mock-card--summary'>
                    <h1>Mock interview complete</h1>
                    <div className={`mock-overall ${scoreClass(session.overallScore)}`}>
                        <span className='mock-overall__value'>{session.overallScore}</span>
                        <span className='mock-overall__label'>Overall score</span>
                    </div>
                    <ul className='mock-summary-list'>
                        {session.turns.map((t, i) => (
                            <li key={i}>
                                <span className={`mock-summary-score ${scoreClass(t.score)}`}>{t.score ?? '—'}</span>
                                <span className='mock-summary-q'>{t.question}</span>
                            </li>
                        ))}
                    </ul>
                    <div className='mock-actions'>
                        <button className='mock-btn mock-btn--primary' onClick={() => window.location.reload()}>Practise again</button>
                        <button className='mock-btn' onClick={() => navigate(`/interview/${interviewId}`)}>Back to report</button>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className='mock-screen'>
            <div className='mock-card'>
                <div className='mock-header'>
                    <div>
                        <p className='mock-eyebrow'>Mock Interview{session.jobTitle ? ` · ${session.jobTitle}` : ''}</p>
                        <h1>Question {Math.min(currentIndex + 1, total)} of {total}</h1>
                    </div>
                    <button className='mock-btn mock-btn--ghost' onClick={() => navigate(`/interview/${interviewId}`)}>Exit</button>
                </div>

                <div className='mock-progress'>
                    <div className='mock-progress__bar' style={{ width: `${(currentIndex / total) * 100}%` }} />
                </div>

                {evaluation ? (
                    <>
                        <p className='mock-question'>{session.turns[ Math.max(0, isComplete ? total - 1 : currentIndex - 1) ]?.question || currentQuestion}</p>
                        <FeedbackPanel evaluation={evaluation} />
                        <div className='mock-actions'>
                            <button className='mock-btn mock-btn--primary' onClick={handleNext}>
                                {session.status === 'completed' ? 'See results' : 'Next question'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className='mock-question'>{currentQuestion}</p>
                        <textarea
                            className='mock-textarea'
                            placeholder='Type your answer as you would say it in a real interview…'
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            disabled={submitting}
                        />
                        {error && <p className='mock-error'>{error}</p>}
                        <div className='mock-actions'>
                            <button
                                className='mock-btn mock-btn--primary'
                                onClick={handleSubmit}
                                disabled={submitting || !answer.trim()}
                            >
                                {submitting ? 'Evaluating…' : 'Submit answer'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}

export default MockInterview

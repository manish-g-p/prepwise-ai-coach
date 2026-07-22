import React from 'react'
import '../style/streaming.scss'

const StatChip = ({ label, value, ready }) => (
    <div className={`stream-stat ${ready ? 'stream-stat--ready' : ''}`}>
        <span className='stream-stat__value'>{ready ? value : '—'}</span>
        <span className='stream-stat__label'>{label}</span>
    </div>
)

const StreamingView = ({ stream, onRetry, onCancel }) => {
    const { status, partial, error } = stream

    if (error) {
        return (
            <main className='stream-screen'>
                <div className='stream-card stream-card--error'>
                    <h1>Generation failed</h1>
                    <p>{error}</p>
                    <div className='stream-actions'>
                        <button className='stream-btn stream-btn--primary' onClick={onRetry}>Try Again</button>
                        <button className='stream-btn' onClick={onCancel}>Back</button>
                    </div>
                </div>
            </main>
        )
    }

    const p = partial || {}
    const techCount = p.technicalQuestions?.length || 0
    const behavCount = p.behavioralQuestions?.length || 0
    const gapCount = p.skillGaps?.length || 0
    const dayCount = p.preparationPlan?.length || 0
    const resCount = (p.learningResources?.githubRepos?.length || 0)
        + (p.learningResources?.youtubeChannels?.length || 0)
        + (p.learningResources?.roadmaps?.length || 0)

    return (
        <main className='stream-screen'>
            <div className='stream-card'>
                <div className='stream-header'>
                    <span className='stream-spinner' />
                    <h1>Building your interview plan</h1>
                </div>
                <p className='stream-status'>{status}</p>

                <div className='stream-stats'>
                    <StatChip label='Match Score' value={`${p.matchScore ?? ''}%`} ready={p.matchScore != null} />
                    <StatChip label='Technical Qs' value={techCount} ready={techCount > 0} />
                    <StatChip label='Behavioral Qs' value={behavCount} ready={behavCount > 0} />
                    <StatChip label='Skill Gaps' value={gapCount} ready={gapCount > 0} />
                    <StatChip label='Prep Days' value={dayCount} ready={dayCount > 0} />
                    <StatChip label='Resources' value={resCount} ready={resCount > 0} />
                </div>

                {techCount > 0 && (
                    <div className='stream-preview'>
                        <p className='stream-preview__label'>Questions coming in…</p>
                        <ul className='stream-preview__list'>
                            {p.technicalQuestions.map((q, i) => (
                                <li key={i} className='stream-preview__item'>
                                    <span className='stream-preview__q'>Q{i + 1}</span>
                                    {q.question}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </main>
    )
}

export default StreamingView

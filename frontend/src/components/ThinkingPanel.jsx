import { useEffect, useRef } from 'react'

export default function ThinkingPanel({ steps, isActive, isOpen, onToggle }) {
  const endRef = useRef(null)

  useEffect(() => {
    if (isOpen && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [steps?.length, isOpen])

  if (!steps?.length && !isActive) return null

  return (
    <div className="thinking-panel">
      <button
        type="button"
        className="thinking-header"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="thinking-content"
      >
        <span className="thinking-toggle-icon">{isOpen ? '▼' : '▶'}</span>
        <span className="thinking-title">Thinking</span>
        {steps?.length > 0 && (
          <span className="thinking-count">{steps.length} steps</span>
        )}
        {isActive && (
          <span className="thinking-dots thinking-dots-header">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </span>
        )}
      </button>
      <div id="thinking-content" className="thinking-content" hidden={!isOpen}>
        {isActive && steps?.length === 0 && (
          <div className="thinking-loading">
            <span className="thinking-text">Thinking</span>
            <span className="thinking-dots">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </span>
          </div>
        )}
        {steps?.length > 0 && (
          <ol className="thinking-steps">
            {steps.map((msg, i) => (
              <li key={i} className="thinking-step">
                {msg}
              </li>
            ))}
            {isActive && (
              <li key="loading" className="thinking-step thinking-step-loading">
                <span className="thinking-dots-inline">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </span>
              </li>
            )}
            <li ref={endRef} aria-hidden className="thinking-anchor" />
          </ol>
        )}
      </div>
    </div>
  )
}

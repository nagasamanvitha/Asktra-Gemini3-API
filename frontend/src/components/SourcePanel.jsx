import { useState } from 'react'

const TYPE_LABELS = {
  slack: 'Slack',
  jira: 'Jira',
  git: 'Git',
  document: 'Document',
}

const TYPE_CLASS = {
  slack: 'source-type-slack',
  jira: 'source-type-jira',
  git: 'source-type-git',
  document: 'source-type-doc',
}

export default function SourcePanel({ sources, sourceDetails, contradictions, sourcePopup, setSourcePopup }) {
  const [localPopup, setLocalPopup] = useState(null)
  const popup = sourcePopup ?? localPopup
  const setPopup = setSourcePopup ?? setLocalPopup

  const details = sourceDetails?.length
    ? sourceDetails
    : (sources || []).map((label) => ({ type: 'document', label, content: label }))

  if (!details?.length && !contradictions?.length) return null

  return (
    <div className="source-panel">
      <h3>Proof of retrieval — click any source to see exact raw text</h3>
      {details?.length > 0 && (
        <ul className="sources-list">
          {details.map((d, i) => (
            <li key={i} className="source-item">
              <button
                type="button"
                className="source-row source-citation"
                onClick={() => setPopup({ label: d.label, content: d.content || d.label, type: d.type })}
                title="View exact raw JSON/text — proves every claim is grounded"
              >
                <span className={`source-type-badge ${TYPE_CLASS[d.type] || ''}`}>
                  {TYPE_LABELS[d.type] || d.type}
                </span>
                <span className="source-label">{d.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {popup && (
        <div className="source-popup-overlay" onClick={() => setPopup(null)} role="dialog" aria-label="Source content">
          <div className="source-popup" onClick={(e) => e.stopPropagation()}>
            <div className="source-popup-header">
              <span className={`source-type-badge ${TYPE_CLASS[popup.type] || ''}`}>
                {TYPE_LABELS[popup.type] || popup.type}
              </span>
              <span className="source-popup-label">{popup.label}</span>
              <button type="button" className="source-popup-close" onClick={() => setPopup(null)} aria-label="Close">
                ×
              </button>
            </div>
            <pre className="source-popup-content">{popup.content}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

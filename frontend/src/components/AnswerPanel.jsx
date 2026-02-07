// Parse text for inline citations [Slack: ...], [Git: ...], [Jira: ...], [Document: ...] and render clickable
const CITATION_REGEX = /\[(Slack|Git|Jira|Document):([^\]]*)\]/g

function renderWithCitations(text, sourceDetails, onCitationClick) {
  if (!text || typeof text !== 'string') return text
  if (!sourceDetails?.length || typeof onCitationClick !== 'function') return text
  const parts = []
  let lastIndex = 0
  let m
  CITATION_REGEX.lastIndex = 0
  while ((m = CITATION_REGEX.exec(text)) !== null) {
    parts.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    parts.push({ type: 'citation', typeLabel: m[1], label: m[2].trim() })
    lastIndex = m.index + m[0].length
  }
  parts.push({ type: 'text', value: text.slice(lastIndex) })
  return parts.map((part, i) => {
    if (part.type === 'text') return <span key={i}>{part.value}</span>
    const detail = sourceDetails.find(
      (d) =>
        d.label && (d.label.includes(part.label) || part.label.includes(d.label)) &&
        (d.type?.toLowerCase() === part.typeLabel?.toLowerCase() || (part.typeLabel === 'Document' && (d.type === 'document' || d.type === 'doc')))
    ) || sourceDetails.find((d) => d.label && d.label.includes(part.label))
    return (
      <button
        key={i}
        type="button"
        className="inline-citation"
        onClick={() => detail && onCitationClick(detail)}
        title={detail ? `View: ${detail.label}` : part.label}
      >
        [{part.typeLabel}: {part.label}]
      </button>
    )
  })
}

export default function AnswerPanel({ result, revealIndex = 99, sourceDetails, onCitationClick }) {
  if (!result) return null

  const hasRisk = result.contradictions?.length > 0 || result.risk
  const causalVisible = 0 < revealIndex
  const truthGapVisible = 1 < revealIndex
  const rootCauseVisible = 2 < revealIndex
  const fixVisible = 3 < revealIndex
  const verificationVisible = 4 < revealIndex
  const truthGapsVisible = 5 < revealIndex

  return (
    <div className="answer-panel">
      <h3>Answer</h3>

      {/* Causal Chain — narrative */}
      {result.root_cause && causalVisible && (
        <div className="block answer-reveal causal-chain visible">
          <span className="label">Causal chain</span>
          <p className="causal-chain-text">
            {renderWithCitations(result.root_cause, sourceDetails, onCitationClick)}
          </p>
          {result.sources?.length > 0 && (
            <p className="causal-chain-sources">
              Context from: {result.sources.slice(0, 3).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Contradictions — Active risk (red tint + alert, easy to scan) */}
      {result.contradictions?.length > 0 && truthGapVisible && (
        <div className="block answer-reveal contradictions-block visible">
          <span className="label contradictions-label">
            <span className="contradictions-icon" aria-hidden>⚠</span>
            Contradictions — Active risk
          </span>
          <ul className="contradictions-list">
            {result.contradictions.map((c, i) => (
              <li key={i}>
                {typeof c === 'string' ? renderWithCitations(c, sourceDetails, onCitationClick) : c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Root Cause Analysis — italic */}
      {result.root_cause && rootCauseVisible && (
        <div className="block answer-reveal root-cause-block visible">
          <span className="label">Root cause analysis</span>
          <p className="root-cause-italic">{result.root_cause}</p>
        </div>
      )}

      {/* Risk */}
      {result.risk && rootCauseVisible && (
        <div className="block answer-reveal visible">
          <span className="label">Risk</span>
          <p>
            {renderWithCitations(result.risk, sourceDetails, onCitationClick)}
          </p>
        </div>
      )}

      {/* Fix steps */}
      {result.fix_steps?.length > 0 && fixVisible && (
        <div className="block answer-reveal visible">
          <span className="label">Fix steps</span>
          <ol>
            {result.fix_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Verification */}
      {result.verification && verificationVisible && (
        <div className="block answer-reveal verification visible">
          <span className="label">Verification</span>
          <code>{result.verification}</code>
        </div>
      )}

      {/* Truth gaps — what's missing (detective / limitations) */}
      {result.truth_gaps?.length > 0 && truthGapsVisible && (
        <div className="block answer-reveal truth-gaps-block visible">
          <span className="label truth-gaps-label">Truth gaps</span>
          <p className="truth-gaps-intro">What the model could not confirm from sources (Causal Disconnect when sources conflict):</p>
          <ul className="truth-gaps-list">
            {result.truth_gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

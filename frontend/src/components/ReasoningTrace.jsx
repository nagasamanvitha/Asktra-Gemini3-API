const STEP_LABELS = [
  'Version inference',
  'Intent analysis',
  'Implementation verification',
  'Documentation audit',
  'Security correlation',
]

/**
 * @param {{ steps: string[], sources?: string[] }} props
 */
export default function ReasoningTrace({ steps, sources = /** @type {string[]} */ ([]) }) {
  if (!steps?.length) return null

  return (
    <div className="reasoning-trace">
      <h3>Internal reasoning trace</h3>
      <div className="reasoning-trace-chain">
        {steps.map((step, i) => (
          <div key={i} className="reasoning-trace-item">
            <div className="reasoning-trace-node">
              <span className="reasoning-trace-node-num">{i + 1}</span>
              {i < steps.length - 1 && (
                <>
                  <span className="reasoning-trace-node-line" aria-hidden />
                  <span className="reasoning-trace-flow-arrow" aria-hidden>→</span>
                </>
              )}
            </div>
            <div className="reasoning-trace-content">
              <span className="reasoning-trace-step-name">
                {STEP_LABELS[i] || `Step ${i + 1}`}
              </span>
              <p className="reasoning-trace-desc">{step}</p>
              {sources[i] && (
                <span className="reasoning-trace-source">Source: {sources[i]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

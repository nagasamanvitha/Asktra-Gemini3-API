import { useState } from 'react'

export default function FindingsSidebar({ sessionMemory, loading, onClear }) {
  const [open, setOpen] = useState(true)

  if (!sessionMemory) {
    return (
      <aside className="findings-sidebar findings-sidebar--empty" aria-label="Session findings">
        <button
          type="button"
          className="findings-sidebar-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="findings-sidebar-icon" aria-hidden>◇</span>
          <span>Findings</span>
          <span className="findings-sidebar-hint">Ask once to populate</span>
        </button>
      </aside>
    )
  }

  const isPulling = loading
  const findings = [
    sessionMemory.inferred_version && { label: 'Version', value: sessionMemory.inferred_version },
    sessionMemory.root_cause && { label: 'Root cause', value: sessionMemory.root_cause },
    sessionMemory.risk && { label: 'Risk', value: sessionMemory.risk },
    sessionMemory.contradictions?.length > 0 && {
      label: 'Contradictions',
      value: sessionMemory.contradictions.join(' · '),
    },
    sessionMemory.fix_steps?.length > 0 && {
      label: 'Fix steps',
      value: sessionMemory.fix_steps.join(' → '),
    },
    sessionMemory.verification && { label: 'Verification', value: sessionMemory.verification },
  ].filter(Boolean)

  return (
    <aside
      className={`findings-sidebar ${isPulling ? 'findings-sidebar--pulse' : ''}`}
      aria-label="Session findings — used when you ask a follow-up"
    >
      <div className="findings-sidebar-header">
        <button
          type="button"
          className="findings-sidebar-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="findings-sidebar-icon" aria-hidden>◇</span>
          <span>Findings</span>
          {isPulling && (
            <span className="findings-sidebar-pulling" aria-hidden>
              Using this…
            </span>
          )}
        </button>
        {onClear && (
          <button
            type="button"
            className="findings-sidebar-clear"
            onClick={onClear}
            title="Clear session memory and start a fresh investigation"
          >
            New investigation
          </button>
        )}
      </div>
      {open && (
        <div className="findings-sidebar-body">
          <p className="findings-sidebar-intro">
            Stored from your last answer. Follow-up questions use these as <strong>Hard Truths</strong> — Asktra won’t overwrite them; it will flag inconsistencies.
          </p>
          <ul className="findings-list">
            {findings.map((f, i) => (
              <li key={i} className="findings-item">
                <span className="findings-item-label">{f.label}</span>
                <span className="findings-item-value">{f.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

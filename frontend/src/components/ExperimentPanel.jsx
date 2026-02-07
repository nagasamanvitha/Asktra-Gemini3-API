import { useEffect, useState } from 'react'

const DEMO_SCRIPT = [
  { step: 1, question: 'Analyze the v2.4 timeout issue.', note: 'Asktra finds the 90s hack (Commit 8a2f, staging leak).' },
  { step: 2, question: 'Actually, I think the timeout is 30s. Why am I seeing errors?', note: 'The "trap" follow-up — user contradicts the finding.' },
  { step: 3, win: 'Asktra should respond: "While the documentation claims 30s, we established earlier that Commit 8a2f set it to 90s for staging, which leaked into production. The errors you see are likely DoS-related due to this 90s limit being active." It corrects the user based on its own investigation (Hard Truths).' },
]

const SOURCES = [
  { id: 'slack', label: 'Slack', desc: 'Team chat – intent, hacks, policy (#dev-backend, #security-alerts)' },
  { id: 'git', label: 'Git', desc: 'Commits, diffs, tags (config.js, merge into main)' },
  { id: 'jira', label: 'Jira', desc: 'Tickets, status, comments (AUTH-101, SEC-442)' },
  { id: 'docs', label: 'Documentation', desc: 'Official docs – what the company says is true (compliance, 30s)' },
  { id: 'releases', label: 'Release notes', desc: 'Version history, release dates (v2.4, v2.5)' },
]

function getContentSummary(key, content) {
  if (!content || !content.trim()) return 'No content'
  if (key === 'docs' || key === 'releases') return `${content.trim().split(/\n/).length} lines · ${content.length} chars`
  try {
    const arr = JSON.parse(content)
    if (Array.isArray(arr)) return `${arr.length} items`
    return typeof arr === 'object' ? '1 object' : '1 value'
  } catch {
    return `${content.length} chars`
  }
}

export default function ExperimentPanel({
  open,
  onClose,
  datasetContent,
  onEdit,
  onResetSource,
  onResetAll,
  datasetLoading,
}) {
  const [demoOpen, setDemoOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="experiment-overlay" onClick={onClose} aria-hidden />
      <aside className="experiment-panel" onClick={(e) => e.stopPropagation()}>
        <div className="experiment-panel-header">
          <h2 className="experiment-panel-title">Investigative Context</h2>
          <button
            type="button"
            className="experiment-panel-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        <div className="experiment-demo-script">
          <button
            type="button"
            className="experiment-demo-script-toggle"
            onClick={() => setDemoOpen((o) => !o)}
            aria-expanded={demoOpen}
          >
            <span>Demo script for judges</span>
            <span className="experiment-demo-script-chevron">{demoOpen ? '▼' : '▶'}</span>
          </button>
          {demoOpen && (
            <div className="experiment-demo-script-body">
              <p className="experiment-demo-script-intro">
                Use this sequence to prove memory and &quot;Hard Truths&quot; — Asktra corrects the user instead of overwriting.
              </p>
              <ol className="experiment-demo-script-steps">
                {DEMO_SCRIPT.map((item, i) => (
                  <li key={i} className="experiment-demo-script-step">
                    {item.question && (
                      <>
                        <strong>Q{item.step}:</strong> &quot;{item.question}&quot;
                        {item.note && <span className="experiment-demo-script-note"> — {item.note}</span>}
                      </>
                    )}
                    {item.win && (
                      <>
                        <strong>Win:</strong>
                        <span className="experiment-demo-script-win"> {item.win}</span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="experiment-panel-intro-block">
          <p className="experiment-panel-intro">
            <strong>Existing data we use</strong> — Below is the data Asktra uses right now. You can <strong>see the content</strong>, <strong>edit it</strong>, or <strong>keep the original</strong> (Reset to default).
          </p>
          <p className="experiment-panel-intro-secondary">
            Edit any source to change what Asktra sees, then ask a question — the answer updates based on your data.
          </p>
        </div>
        <div className="experiment-sources">
          <div className="experiment-sources-heading-row">
            <span className="experiment-sources-heading">Content per source (edit or keep)</span>
            {!datasetLoading && datasetContent && (
              <button
                type="button"
                className="experiment-reset-all-btn"
                onClick={onResetAll}
              >
                Reset all to default
              </button>
            )}
          </div>
          {datasetLoading && (
            <div className="experiment-loading">Loading existing data…</div>
          )}
          {!datasetLoading && !datasetContent && (
            <div className="experiment-loading experiment-loading-error">
              <p>Default data didn’t load. Make sure the backend is running (e.g. <code>npm run dev</code> from the repo root).</p>
              <p>Click <strong>Reset all to default</strong> above to retry, or paste your own data in the boxes below.</p>
            </div>
          )}
          {SOURCES.map(({ id, label, desc }) => {
              const content = datasetContent?.[id] ?? ''
              const summary = getContentSummary(id, content)
              return (
                <div key={id} className="experiment-source-block">
                  <div className="experiment-source-block-header">
                    <span className="experiment-source-label">{label}</span>
                    <span className="experiment-source-badge">Used for reasoning</span>
                    {onResetSource && (
                      <button
                        type="button"
                        className="experiment-reset-source-btn"
                        onClick={() => onResetSource(id)}
                        title="Restore original content for this source"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                  <p className="experiment-source-desc">{desc}</p>
                  <p className="experiment-source-summary">
                    Content: <strong>{summary}</strong> — edit below or keep as is.
                  </p>
                  <textarea
                    className="experiment-source-textarea"
                    value={content}
                    onChange={(e) => onEdit(id, e.target.value)}
                    placeholder={`Paste or edit ${label} content…`}
                    spellCheck={false}
                    rows={id === 'docs' || id === 'releases' ? 10 : 8}
                  />
                </div>
              )
            })}
        </div>
        <p className="experiment-panel-hint">
          Your edits are used when you click <strong>Ask</strong>. Invalid JSON in Slack/Git/Jira is sent as plain text.
        </p>
      </aside>
    </>
  )
}

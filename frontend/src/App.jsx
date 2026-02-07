import { useState, useEffect } from 'react'
import QueryBox from './components/QueryBox'
import ThinkingPanel from './components/ThinkingPanel'
import AnswerPanel from './components/AnswerPanel'
import ReasoningTrace from './components/ReasoningTrace'
import SourcePanel from './components/SourcePanel'
import DocDiff from './components/DocDiff'
import ExperimentPanel from './components/ExperimentPanel'
import FindingsSidebar from './components/FindingsSidebar'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SOURCE_KEYS = ['slack', 'git', 'jira', 'docs', 'releases']

function toEditable(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function buildDatasetOverrides(datasetContent) {
  if (!datasetContent) return null
  const out = {}
  for (const key of SOURCE_KEYS) {
    const s = datasetContent[key]
    if (s == null || s === '') continue
    if (key === 'docs' || key === 'releases') {
      out[key] = s
    } else {
      try {
        out[key] = JSON.parse(s)
      } catch {
        out[key] = s
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function buildPriorContext(memory) {
  if (!memory) return null
  const parts = []
  if (memory.inferred_version) parts.push(`Inferred version: ${memory.inferred_version}`)
  if (memory.root_cause) parts.push(`Root cause: ${memory.root_cause}`)
  if (memory.risk) parts.push(`Risk: ${memory.risk}`)
  if (memory.contradictions?.length) parts.push(`Contradictions: ${memory.contradictions.join('; ')}`)
  if (memory.fix_steps?.length) parts.push(`Fix steps: ${memory.fix_steps.join('; ')}`)
  if (memory.verification) parts.push(`Verification: ${memory.verification}`)
  return parts.length > 0 ? parts.join('\n') : null
}

export default function App() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [error, setError] = useState(null)
  const [emittedDoc, setEmittedDoc] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [revealIndex, setRevealIndex] = useState(0)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [experimentOpen, setExperimentOpen] = useState(false)
  const [datasetContent, setDatasetContent] = useState(null)
  const [datasetLoading, setDatasetLoading] = useState(false)
  const [sessionMemory, setSessionMemory] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [bundleLoading, setBundleLoading] = useState(false)
  const [bundleOpen, setBundleOpen] = useState(false)
  const [sourcePopup, setSourcePopup] = useState(null)

  useEffect(() => {
    if (!experimentOpen) return
    setDatasetLoading(true)
    const url = API_BASE ? `${API_BASE}/dataset` : '/dataset'
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to load dataset')))
      .then((data) => {
        setDatasetContent({
          slack: toEditable(data.slack),
          git: toEditable(data.git),
          jira: toEditable(data.jira),
          docs: toEditable(data.docs),
          releases: toEditable(data.releases),
        })
      })
      .catch(() => setDatasetContent(null))
      .finally(() => setDatasetLoading(false))
  }, [experimentOpen])

  function onEditSource(key, value) {
    setDatasetContent((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  async function onResetSource(key) {
    const url = API_BASE ? `${API_BASE}/dataset` : '/dataset'
    try {
      const r = await fetch(url)
      if (!r.ok) return
      const data = await r.json()
      setDatasetContent((prev) => (prev ? { ...prev, [key]: toEditable(data[key]) } : null))
    } catch (_) {}
  }

  async function onResetAllSources() {
    setDatasetLoading(true)
    const url = API_BASE ? `${API_BASE}/dataset` : '/dataset'
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('Failed to load')
      const data = await r.json()
      setDatasetContent({
        slack: toEditable(data.slack),
        git: toEditable(data.git),
        jira: toEditable(data.jira),
        docs: toEditable(data.docs),
        releases: toEditable(data.releases),
      })
    } catch (_) {}
    setDatasetLoading(false)
  }

  async function onAsk(query, imageBase64 = null, imageMime = null) {
    if (!query?.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setEmittedDoc(null)
    setThinkingSteps([])
    setRevealIndex(0)
    setThinkingOpen(true) // expand thinking while loading
    try {
      const body = { query: query.trim() }
      const overrides = buildDatasetOverrides(datasetContent)
      if (overrides) body.dataset_overrides = overrides
      const prior = buildPriorContext(sessionMemory)
      if (prior) body.prior_context = prior
      if (imageBase64) body.image_base64 = imageBase64
      if (imageMime) body.image_mime = imageMime

      const res = await fetch(`${API_BASE}/ask-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const eventMatch = part.match(/^event:\s*(\w+)\ndata:\s*([\s\S]+)/)
          if (!eventMatch) continue
          const [, eventType, dataStr] = eventMatch
          try {
            const data = JSON.parse(dataStr.trim())
            if ((eventType === 'step' || eventType === 'status') && data.message) {
              setThinkingSteps((prev) => [...prev, data.message])
            } else if (eventType === 'result') {
              setResult(data)
              setSessionMemory({
                inferred_version: data.inferred_version,
                root_cause: data.root_cause,
                risk: data.risk,
                contradictions: data.contradictions || [],
                fix_steps: data.fix_steps || [],
                verification: data.verification,
              })
              setLoading(false)
              setThinkingOpen(false) // collapse thinking after result
              // Progressive reveal: show answer sections one by one
              const sections = ['root_cause', 'risk', 'contradictions', 'fix_steps', 'verification', 'truth_gaps']
              sections.forEach((_, i) => {
                setTimeout(() => setRevealIndex((r) => Math.max(r, i + 1)), 120 * (i + 1))
              })
              return
            } else if (eventType === 'error' && data.detail) {
              setError(data.detail)
              setLoading(false)
              return
            }
          } catch (_) {}
        }
      }
      setLoading(false)
    } catch (e) {
      setError(e.message || 'Request failed')
      setLoading(false)
    }
  }

  async function onGenerateBundle() {
    if (!result) return
    setBundleLoading(true)
    setBundle(null)
    setBundleOpen(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/reconciliation-bundle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inferred_version: result.inferred_version,
          root_cause: result.root_cause,
          contradictions: result.contradictions || [],
          risk: result.risk,
          fix_steps: result.fix_steps || [],
          verification: result.verification,
          sources: result.sources || [],
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      const data = await res.json()
      setBundle({
        post_mortem: data?.post_mortem ?? '',
        pr_diff: data?.pr_diff ?? '',
        slack_summary: data?.slack_summary ?? '',
      })
    } catch (e) {
      let msg = e.message || 'Bundle generation failed'
      try {
        const o = JSON.parse(msg)
        if (o?.detail && typeof o.detail === 'string') msg = o.detail
      } catch (_) {}
      setError(msg)
    } finally {
      setBundleLoading(false)
    }
  }

  async function onSyncReality() {
    if (!result) return
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/emit-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inferred_version: result.inferred_version,
          root_cause: result.root_cause,
          contradictions: result.contradictions,
          risk: result.risk,
          fix_steps: result.fix_steps,
          verification: result.verification,
          sources: result.sources,
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      const data = await res.json()
      setEmittedDoc(data.markdown || '')
    } catch (e) {
      setError(e.message || 'Emit failed')
    } finally {
      setSyncing(false)
    }
  }

  function clearSession() {
    setSessionMemory(null)
    setResult(null)
    setThinkingSteps([])
    setRevealIndex(0)
    setError(null)
    setEmittedDoc(null)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Asktra</h1>
            <p className="tagline">The Cognitive Librarian for Software Systems</p>
          </div>
          <button
            type="button"
            className="experiment-tab-btn"
            onClick={() => setExperimentOpen(true)}
            aria-expanded={experimentOpen}
          >
            Investigative Context
          </button>
        </div>
      </header>

      <ExperimentPanel
        open={experimentOpen}
        onClose={() => setExperimentOpen(false)}
        datasetContent={datasetContent}
        onEdit={onEditSource}
        onResetSource={onResetSource}
        onResetAll={onResetAllSources}
        datasetLoading={datasetLoading}
      />

      <div className="app-inner">
        <main className="app-main">
      <div className="query-row">
        <QueryBox onAsk={onAsk} loading={loading} disabled={loading} />
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {(loading || thinkingSteps.length > 0) && (
        <ThinkingPanel
          steps={thinkingSteps}
          isActive={loading}
          isOpen={thinkingOpen}
          onToggle={() => setThinkingOpen((o) => !o)}
        />
      )}

      {result && (
        <>
          <section className="version-bar">
            <div className="version-bar-top">
              <div className="version-bar-left">
                <span className="version-label">Inferred version</span>
                <div className="version-value-row">
                  <span className="version-value">{result.inferred_version}</span>
                  <span className="version-confidence-badge" title="Probabilistic reasoning: high when version appears in both Git tag and Slack timestamp; lower when only one source.">
                    {(result.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <span className="version-confidence">
                  High when version is found in Git tag and Slack timestamp; lower when only one source. Based on {Math.max(result.evidence?.length || 0, result.sources?.length || 0, 1)} signal{(result.evidence?.length || result.sources?.length || 0) !== 1 ? 's' : ''}.
                </span>
              </div>
              {(result.contradictions?.length > 0 || result.risk) && (
                <span className="version-risk-badge">
                  <span className="version-risk-icon" aria-hidden>⚠</span>
                  High risk detected
                </span>
              )}
            </div>
            {result.evidence?.length > 0 && (
              <ul className="evidence">
                {result.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </section>

          <div className="panels">
            <AnswerPanel
              result={result}
              revealIndex={revealIndex}
              sourceDetails={result.source_details}
              onCitationClick={(detail) => setSourcePopup(detail)}
            />
            <ReasoningTrace steps={result.reasoning_trace} sources={result.sources} />
          </div>

          <SourcePanel
              sources={result.sources}
              sourceDetails={result.source_details}
              contradictions={result.contradictions}
              sourcePopup={sourcePopup}
              setSourcePopup={setSourcePopup}
            />

          <div className="sync-row">
            <button
              type="button"
              className="sync-reality"
              onClick={onSyncReality}
              disabled={syncing}
            >
              {syncing ? 'Generating…' : 'Sync Reality'}
            </button>
            <button
              type="button"
              className="sync-reality bundle-btn"
              onClick={onGenerateBundle}
              disabled={bundleLoading}
            >
              {bundleLoading ? 'Generating…' : 'Generate Reconciliation Bundle'}
            </button>
            {syncing && (
              <div className="sync-progress">
                <div className="sync-progress-label">Generating PR-Ready Markdown…</div>
                <div className="sync-progress-bar">
                  <div className="sync-progress-fill" />
                </div>
              </div>
            )}
          </div>

          {bundleOpen && (
            <div className="bundle-overlay" onClick={() => setBundleOpen(false)} aria-hidden />
          )}
          {bundleOpen && (
            <aside className="bundle-modal" onClick={e => e.stopPropagation()}>
              <div className="bundle-modal-header">
                <h3>Reconciliation Bundle</h3>
                <button type="button" className="bundle-modal-close" onClick={() => setBundleOpen(false)} aria-label="Close">×</button>
              </div>
              <div className="bundle-modal-body">
                {bundleLoading && <p className="bundle-loading">Generating post-mortem, PR diff, Slack summary…</p>}
                {!bundleLoading && !bundle && (
                  <div className="bundle-empty-state">
                    <p>Bundle could not be generated.</p>
                    <p className="bundle-empty-hint">Run a query first, then click &quot;Generate Reconciliation Bundle&quot; again. If the problem persists, check the error message below.</p>
                    {error && <p className="bundle-empty-error">{error}</p>}
                  </div>
                )}
                {bundle && !bundleLoading && (
                  <>
                    <section className="bundle-section">
                      <h4>Incident report (post-mortem)</h4>
                      <p className="bundle-desc">Remediation bundle: summary for the team.</p>
                      <pre className="bundle-content">{bundle.post_mortem || '(empty)'}</pre>
                      <div className="bundle-actions">
                        <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.post_mortem || '')}>Copy</button>
                        <a className="bundle-download" href={URL.createObjectURL(new Blob([bundle.post_mortem || ''], { type: 'text/plain' }))} download="incident_report.txt">Download incident_report.txt</a>
                      </div>
                    </section>
                    <section className="bundle-section">
                      <h4>Remedy patch (PR diff)</h4>
                      <p className="bundle-desc">Code fix — GitHub PR / diff.</p>
                      <pre className="bundle-content">{bundle.pr_diff || '(empty)'}</pre>
                      <div className="bundle-actions">
                        <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.pr_diff || '')}>Copy</button>
                        <a className="bundle-download" href={URL.createObjectURL(new Blob([bundle.pr_diff || ''], { type: 'text/markdown' }))} download="remedy_patch.diff">Download remedy_patch.diff</a>
                      </div>
                    </section>
                    <section className="bundle-section">
                      <h4>Stakeholder summary (Slack)</h4>
                      <p className="bundle-desc">Slack message to notify stakeholders.</p>
                      <pre className="bundle-content slack-summary">{bundle.slack_summary || '(empty)'}</pre>
                      <div className="bundle-actions">
                        <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.slack_summary || '')}>Copy</button>
                        <a className="bundle-download" href={URL.createObjectURL(new Blob([bundle.slack_summary || ''], { type: 'text/plain' }))} download="updated_compliance.md">Download updated_compliance.md</a>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </aside>
          )}

          {emittedDoc && <DocDiff markdown={emittedDoc} />}
        </>
      )}

      <footer className="footer">
        Asktra doesn’t answer questions — it protects systems by remembering why the code exists.
      </footer>
        </main>
        <FindingsSidebar
          sessionMemory={sessionMemory}
          loading={loading}
          onClear={sessionMemory ? clearSession : undefined}
        />
      </div>
    </div>
  )
}

"use client";

import { useState, useEffect } from "react";
import QueryBox from "@/frontend/src/components/QueryBox";
import ThinkingPanel from "@/frontend/src/components/ThinkingPanel";
import AnswerPanel from "@/frontend/src/components/AnswerPanel";
import ReasoningTrace from "@/frontend/src/components/ReasoningTrace";
import SourcePanel from "@/frontend/src/components/SourcePanel";
import DocDiff from "@/frontend/src/components/DocDiff";
import ExperimentPanel from "@/frontend/src/components/ExperimentPanel";
import FindingsSidebar from "@/frontend/src/components/FindingsSidebar";

const API_BASE = "/api";
const SOURCE_KEYS = ["slack", "git", "jira", "docs", "releases"];

function toEditable(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function buildDatasetOverrides(datasetContent: Record<string, string> | null): Record<string, unknown> | null {
  if (!datasetContent) return null;
  const out: Record<string, unknown> = {};
  for (const key of SOURCE_KEYS) {
    const s = datasetContent[key];
    if (s == null || s === "") continue;
    if (key === "docs" || key === "releases") {
      out[key] = s;
    } else {
      try {
        out[key] = JSON.parse(s);
      } catch {
        out[key] = s;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildPriorContext(memory: Record<string, unknown> | null): string | null {
  if (!memory) return null;
  const parts: string[] = [];
  if (memory.inferred_version) parts.push(`Inferred version: ${memory.inferred_version}`);
  if (memory.root_cause) parts.push(`Root cause: ${memory.root_cause}`);
  if (memory.risk) parts.push(`Risk: ${memory.risk}`);
  if (Array.isArray(memory.contradictions) && memory.contradictions.length)
    parts.push(`Contradictions: ${(memory.contradictions as string[]).join("; ")}`);
  if (Array.isArray(memory.fix_steps) && memory.fix_steps.length)
    parts.push(`Fix steps: ${(memory.fix_steps as string[]).join("; ")}`);
  if (memory.verification) parts.push(`Verification: ${memory.verification}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

export default function Page() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emittedDoc, setEmittedDoc] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [revealIndex, setRevealIndex] = useState(0);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [datasetContent, setDatasetContent] = useState<Record<string, string> | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [sessionMemory, setSessionMemory] = useState<Record<string, unknown> | null>(null);
  const [bundle, setBundle] = useState<{ post_mortem: string; pr_diff: string; slack_summary: string } | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [sourcePopup, setSourcePopup] = useState<{ type: string; label: string; content: string } | null>(null);

  useEffect(() => {
    if (!experimentOpen) return;
    setDatasetLoading(true);
    fetch(`${API_BASE}/dataset`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load dataset"))))
      .then((data: Record<string, unknown>) => {
        setDatasetContent({
          slack: toEditable(data.slack),
          git: toEditable(data.git),
          jira: toEditable(data.jira),
          docs: toEditable(data.docs),
          releases: toEditable(data.releases),
        });
      })
      .catch(() => setDatasetContent(null))
      .finally(() => setDatasetLoading(false));
  }, [experimentOpen]);

  function onEditSource(key: string, value: string) {
    setDatasetContent((prev) => (prev ? { ...prev, [key]: value } : null));
  }

  async function onResetSource(key: string) {
    try {
      const r = await fetch(`${API_BASE}/dataset`);
      if (!r.ok) return;
      const data = (await r.json()) as Record<string, unknown>;
      setDatasetContent((prev) =>
        prev ? { ...prev, [key]: toEditable(data[key]) } : null
      );
    } catch {}
  }

  async function onResetAllSources() {
    setDatasetLoading(true);
    try {
      const r = await fetch(`${API_BASE}/dataset`);
      if (!r.ok) throw new Error("Failed to load");
      const data = (await r.json()) as Record<string, unknown>;
      setDatasetContent({
        slack: toEditable(data.slack),
        git: toEditable(data.git),
        jira: toEditable(data.jira),
        docs: toEditable(data.docs),
        releases: toEditable(data.releases),
      });
    } catch {}
    setDatasetLoading(false);
  }

  async function onAsk(query: string, imageBase64?: string | null, imageMime?: string | null) {
    if (!query?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEmittedDoc(null);
    setThinkingSteps([]);
    setRevealIndex(0);
    setThinkingOpen(true);
    try {
      const body: Record<string, unknown> = { query: query.trim() };
      const overrides = buildDatasetOverrides(datasetContent);
      if (overrides) body.dataset_overrides = overrides;
      const prior = buildPriorContext(sessionMemory);
      if (prior) body.prior_context = prior;
      if (imageBase64) body.image_base64 = imageBase64;
      if (imageMime) body.image_mime = imageMime;

      const res = await fetch(`${API_BASE}/ask-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const eventMatch = part.match(/^event:\s*(\w+)\ndata:\s*(.+)/s);
          if (!eventMatch) continue;
          const [, eventType, dataStr] = eventMatch;
          try {
            const data = JSON.parse(dataStr.trim()) as Record<string, unknown>;
            if ((eventType === "step" || eventType === "status") && data.message) {
              setThinkingSteps((prev) => [...prev, data.message as string]);
            } else if (eventType === "result") {
              setResult(data);
              setSessionMemory({
                inferred_version: data.inferred_version,
                root_cause: data.root_cause,
                risk: data.risk,
                contradictions: data.contradictions ?? [],
                fix_steps: data.fix_steps ?? [],
                verification: data.verification,
              });
              setLoading(false);
              setThinkingOpen(false);
              setRevealIndex(0);
              setTimeout(() => setRevealIndex(1), 120);
              setTimeout(() => setRevealIndex(2), 240);
              setTimeout(() => setRevealIndex(3), 360);
              setTimeout(() => setRevealIndex(4), 480);
              setTimeout(() => setRevealIndex(5), 600);
              setTimeout(() => setRevealIndex(6), 720);
              return;
            } else if (eventType === "error" && data.detail) {
              setError(data.detail as string);
              setLoading(false);
              return;
            }
          } catch {}
        }
      }
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLoading(false);
    }
  }

  async function onGenerateBundle() {
    if (!result) return;
    setBundleLoading(true);
    setBundle(null);
    setBundleOpen(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reconciliation-bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inferred_version: result.inferred_version,
          root_cause: result.root_cause,
          contradictions: result.contradictions ?? [],
          risk: result.risk,
          fix_steps: result.fix_steps ?? [],
          verification: result.verification,
          sources: result.sources ?? [],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const data = (await res.json()) as { post_mortem?: string; pr_diff?: string; slack_summary?: string };
      setBundle({
        post_mortem: data?.post_mortem ?? "",
        pr_diff: data?.pr_diff ?? "",
        slack_summary: data?.slack_summary ?? "",
      });
    } catch (e) {
      let msg = e instanceof Error ? e.message : "Bundle generation failed";
      try {
        const o = JSON.parse(msg) as { detail?: string };
        if (typeof o?.detail === "string") msg = o.detail;
      } catch {}
      setError(msg);
    } finally {
      setBundleLoading(false);
    }
  }

  async function onSyncReality() {
    if (!result) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/emit-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inferred_version: result.inferred_version,
          root_cause: result.root_cause,
          contradictions: result.contradictions,
          risk: result.risk,
          fix_steps: result.fix_steps,
          verification: result.verification,
          sources: result.sources,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const data = (await res.json()) as { markdown?: string };
      setEmittedDoc(data.markdown ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Emit failed");
    } finally {
      setSyncing(false);
    }
  }

  function clearSession() {
    setSessionMemory(null);
    setResult(null);
    setThinkingSteps([]);
    setRevealIndex(0);
    setError(null);
    setEmittedDoc(null);
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

          {error && <div className="error-banner">{error}</div>}

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
                      <span className="version-value">{String(result.inferred_version)}</span>
                      <span className="version-confidence-badge" title="Probabilistic reasoning">
                        {Math.round((Number(result.confidence) || 0) * 100)}% confidence
                      </span>
                    </div>
                    <span className="version-confidence">
                      Based on {Math.max((result.evidence as string[])?.length ?? 0, (result.sources as string[])?.length ?? 0, 1)} signal(s).
                    </span>
                  </div>
                  {((result.contradictions as string[])?.length > 0 || result.risk) && (
                    <span className="version-risk-badge">
                      <span className="version-risk-icon" aria-hidden>⚠</span>
                      High risk detected
                    </span>
                  )}
                </div>
                {(result.evidence as string[])?.length > 0 && (
                  <ul className="evidence">
                    {(result.evidence as string[]).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="panels">
                <AnswerPanel
                  result={result}
                  revealIndex={revealIndex}
                  sourceDetails={(result.source_details as { type: string; label: string; content: string }[]) ?? []}
                  onCitationClick={(d) => setSourcePopup(d)}
                />
                <ReasoningTrace
                  steps={(result.reasoning_trace as string[]) ?? []}
                  sources={(result.sources as string[]) ?? []}
                />
              </div>

              <SourcePanel
                sources={(result.sources as string[]) ?? []}
                sourceDetails={(result.source_details as { type: string; label: string; content: string }[]) ?? []}
                contradictions={(result.contradictions as string[]) ?? []}
                sourcePopup={sourcePopup}
                setSourcePopup={setSourcePopup}
              />

              <div className="sync-row">
                <button type="button" className="sync-reality" onClick={onSyncReality} disabled={syncing}>
                  {syncing ? "Generating…" : "Sync Reality"}
                </button>
                <button type="button" className="sync-reality bundle-btn" onClick={onGenerateBundle} disabled={bundleLoading}>
                  {bundleLoading ? "Generating…" : "Generate Reconciliation Bundle"}
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

              {bundleOpen && <div className="bundle-overlay" onClick={() => setBundleOpen(false)} aria-hidden />}
              {bundleOpen && (
                <aside className="bundle-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="bundle-modal-header">
                    <h3>Reconciliation Bundle</h3>
                    <button type="button" className="bundle-modal-close" onClick={() => setBundleOpen(false)} aria-label="Close">
                      ×
                    </button>
                  </div>
                  <div className="bundle-modal-body">
                    {bundleLoading && <p className="bundle-loading">Generating…</p>}
                    {!bundleLoading && !bundle && (
                      <div className="bundle-empty-state">
                        <p>Bundle could not be generated.</p>
                        {error && <p className="bundle-empty-error">{error}</p>}
                      </div>
                    )}
                    {bundle && !bundleLoading && (
                      <>
                        <section className="bundle-section">
                          <h4>Incident report (post-mortem)</h4>
                          <pre className="bundle-content">{bundle.post_mortem || "(empty)"}</pre>
                          <div className="bundle-actions">
                            <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.post_mortem ?? "")}>
                              Copy
                            </button>
                          </div>
                        </section>
                        <section className="bundle-section">
                          <h4>Remedy patch (PR diff)</h4>
                          <pre className="bundle-content">{bundle.pr_diff || "(empty)"}</pre>
                          <div className="bundle-actions">
                            <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.pr_diff ?? "")}>
                              Copy
                            </button>
                          </div>
                        </section>
                        <section className="bundle-section">
                          <h4>Stakeholder summary (Slack)</h4>
                          <pre className="bundle-content slack-summary">{bundle.slack_summary || "(empty)"}</pre>
                          <div className="bundle-actions">
                            <button type="button" className="bundle-copy" onClick={() => navigator.clipboard.writeText(bundle.slack_summary ?? "")}>
                              Copy
                            </button>
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
            Asktra doesn&apos;t answer questions — it protects systems by remembering why the code exists.
          </footer>
        </main>
        <FindingsSidebar
          sessionMemory={sessionMemory}
          loading={loading}
          onClear={sessionMemory ? clearSession : undefined}
        />
      </div>
    </div>
  );
}

# Asktra — Causal Reconciliation for Software Systems

Asktra is **not** a better way to search OAuth docs. It is a **causal reasoning** system: it understands that a Slack message on Tuesday changed the *truth* of the documentation on Wednesday. Using Gemini's high-reasoning capabilities, Asktra performs **temporal version isolation** and **causal reconciliation** across Developer Intent (Slack/Jira), Technical Reality (Git), and Stated Documentation — and flags **Truth Gaps** instead of trusting the README.

---

## 📋 Audit Readiness (Compliance & CTO/Legal)

**Asktra isn’t just for debugging — it’s for Compliance.**

Software engineers love tools; **CTOs and Legal Teams buy them.** Asktra proves to auditors that you are tracking the **Intent** behind security and config changes, not just the code. Every finding is grounded in a specific source (Slack, Git, Jira, Docs): **click any source** (e.g. "Slack 2025-09-13") to open a modal with the exact raw JSON/text — proof of retrieval and no hallucination. That shifts the project from a "dev tool" to a **business necessity** — audit-ready causal reasoning with a full chain from developer intent to documentation and back.

---

## 🔬 The Truth Gap Detector

**Asktra is the first system that doesn't trust documentation.**

Using Gemini's high-reasoning capabilities, Asktra cross-references **Official Docs** against **Developer Intent (Slack)** and **Technical Reality (Git)**. If the README says *"30s timeout"* but a developer in Slack said *"I bumped it to 90s for a demo,"* Asktra flags **Documentation Drift** as a high-priority risk. It doesn't overwrite the doc; it reconciles *why* the code exists with *what* the doc claims — and emits actionable findings (root cause, contradictions, fix steps, verification) with a full reasoning trace.

---

## 🏛 Architecture: From Ingestion to Action

| Phase | Name | Activity | Tech |
|-------|------|----------|------|
| **0** | **Semantic Intent Mapping** | Before answering, Gemini analyzes Slack/Jira to identify *Social Intent* (e.g. "Sarah said this is a temporary hack"). | `thinking_level: HIGH` to extract latent risks not explicitly in code. |
| 1 | Ingestion | Slack, Git, Jira, Docs, Releases loaded and normalized. | Preloaded dataset + optional overrides. |
| 2 | **Temporal Version Isolation** | Infer which release boundary the question belongs to (e.g. v2.4). | Version inference model; reasoning only within that time window. |
| 3 | **Causal Graph Retrieval** | Connect reasons across sources — not just "find text," but "Slack intent → Git commit → Doc claim." | Cross-source causal reasoning. |
| 4 | Causal Reasoning | Root cause, contradictions, risk, fix steps, verification. | Causal reconciliation prompt + prior session (Hard Truths). |
| 5 | Reasoning Trace | Explicit chain of thought and source citations. | Stored per answer; shown in UI. |
| 6 | Documentation Emission | PR-ready Markdown reflecting *true* behavior. | `POST /emit-docs`. |
| **7** | **Causal Reconciliation (Closer)** | Final validation: compare Generated Answer against Git History to ensure no Truth Gaps were introduced. | Thought signatures; chain from first Slack message to final PR suggestion. |

**Phase 0** and **Phase 7** are the agentic loop: intent extraction before reasoning, and truth validation after generation.

---

## 🛠 Feature Language (Winning Frame)

| Old / Generic Name | New "Winning" Name | Why it Wins |
|--------------------|--------------------|-------------|
| Version-Aware Responses | **Temporal Version Isolation** | AI "time travels" to reason only within a specific release's constraints. |
| Enhanced Glossary System | **Autonomous Intent & Risk Tagger** | Detects security risks and architectural intent from Slack/Jira, not just terms. |
| Hybrid Retrieval | **Causal Graph Retrieval** | Connects *reasons* across Slack and Git, not just text similarity. |
| URL Content Extraction | **Multimodal Ingestion Pipeline** | Gemini can "see" screenshots of docs or video walkthroughs (vision-ready). |

---

## 🎥 Multimodal Proof (The "Wow" Factor)

**Asktra doesn't just read; it observes.**

Users can upload a screen recording of a terminal error. Asktra uses Gemini's native vision to perform OCR on the error, match the timestamp to a Jira ticket, and identify the Slack discussion where the breaking change was debated. The pipeline is **multimodal-ingestion ready**: same causal reconciliation, with images/video as additional sources.

---

## 🚀 API Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ask-stream` | Causal reasoning with streaming steps; accepts `prior_context` (living knowledge). |
| POST | `/ask` | Same as above, non-streaming. |
| POST | `/emit-docs` | Emit PR-ready Markdown from a causal analysis (no auto-merge). |
| POST | **`/emit-reconciliation-patch`** | **Action endpoint:** Generate a reconciliation patch or PR for a specific finding (e.g. doc drift). |
| GET | `/dataset` | Return current Slack/Git/Jira/Docs/Releases for inspection or override. |
| GET | `/health` | Health check. |

### The "Winning" API Call: Autonomous Documentation Correction

```bash
curl -X POST "http://localhost:8000/emit-reconciliation-patch" \
  -H "Content-Type: application/json" \
  -d '{
    "finding_id": "AUTH_TIMEOUT_CONFLICT",
    "target": "GitHub",
    "action": "generate_pr"
  }'
```

Returns a **PR body** (or patch description) that reconciles the finding with the target (e.g. GitHub, Confluence) — ready for human review. No auto-merge; the agent *proposes* the fix.

---

## ⚙️ Environment & Reasoning Config

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Required for backend. |
| `GEMINI_MODEL` | Optional. Default: `gemini-3-flash-preview`. Use `gemini-2.5-pro` or `gemini-3-pro-preview` for deep reasoning. |
| **`GEMINI_THINKING_LEVEL`** | Optional. Set to **`HIGH`** for Phase 0 (Semantic Intent Mapping) and Phase 7 (Causal Reconciliation). Uses Gemini's extended thinking to extract latent risks and validate Truth Gaps. Omit or set to `LOW` for faster, lighter runs. |
| `VITE_API_URL` | Optional. Frontend API base. Default: same origin (Vite proxy). |

**Config note:** In `backend/gemini_client.py`, generation uses the configured model; when `GEMINI_THINKING_LEVEL=HIGH` is set, the client passes a thinking config so Gemini performs extended reasoning (thought chain) before answering — critical for causal reconciliation and Truth Gap detection.

---

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r ../requirements.txt
export GEMINI_API_KEY=your_key
# Optional: export GEMINI_THINKING_LEVEL=HIGH
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Ask: **"Why does auth timeout fail?"** — Asktra infers v2.4, shows the contradiction (docs 30s vs code 90s), reasoning trace, and sources. Use **Findings** (sidebar) and a follow-up like *"Actually, I think the timeout is 30s"* to see **Hard Truths**: Asktra corrects the user from its own investigation. Click **Sync Reality** for emitted documentation.

### 3. Demo Flow for Judges (under 3 minutes)

1. **Pain (0:00–0:30):** "Docs say this bug is impossible. The dev who wrote this left."
2. **Input (0:30–1:00):** Show preloaded Slack, Git, README, Jira — no version dropdown.
3. **Win (1:00–2:20):** Ask *"Analyze the v2.4 timeout issue."* Show inferred version, evidence, **Truth Gap** (30s vs 90s), fix steps, reasoning trace. Then ask the **trap**: *"Actually, I think the timeout is 30s. Why am I seeing errors?"* — Asktra corrects the user: *"We established earlier that Commit 8a2f set it to 90s…"* (Hard Truths).
4. **Close (2:20–3:00):** Click **Sync Reality**; show emitted Markdown. Optional: call **`/emit-reconciliation-patch`** to show the Actionable Agent generating a PR for the finding.

**Demo video tip:** Ensure the video shows the **Truth Gap** logic — where the AI corrects the user based on a hidden Slack message and Git commit.

---

## Project Structure

```
asktra/
├── backend/
│   ├── main.py              # FastAPI: /ask, /ask-stream, /emit-docs, /emit-reconciliation-patch, /dataset
│   ├── gemini_client.py     # Version inference, causal reasoning, emit_docs, emit_reconciliation_patch
│   ├── dataset/             # slack.json, git.json, jira.json, docs.md, releases.md
│   └── prompts/             # infer_version, causal_reasoning, emit_docs
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/      # QueryBox, AnswerPanel, ReasoningTrace, FindingsSidebar, SourcePanel, DocDiff
├── requirements.txt
└── README.md
```

---

## Judging One-Liner

**Asktra doesn't answer questions — it protects systems by remembering *why* the code exists, and by refusing to trust the doc when Slack and Git tell a different story.**

---

## License

MIT.

/**
 * Asktra engine — port of Python backend logic. Uses @google/genai (no uvicorn).
 */
import { getGemini, getModel, getBundleModel } from "./gemini";
import { getDataset, loadPrompt, type Dataset } from "./data";
import { getSourceDetails } from "./sourceResolver";

function extractJson(text: string): Record<string, unknown> {
  const t = (text || "").trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {}
  let raw = t;
  if (raw.includes("```json")) raw = raw.split("```json")[1]?.split("```")[0]?.trim() ?? raw;
  else if (raw.includes("```")) raw = raw.split("```")[1]?.split("```")[0]?.trim() ?? raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {}
  const start = raw.indexOf("{");
  if (start === -1) return {};
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return {};
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {}
  return {};
}

function buildContext(
  includeSources: string[] | undefined,
  datasetOverrides: Record<string, unknown> | undefined
): string {
  let data: Dataset = getDataset();
  if (datasetOverrides) {
    data = { ...data };
    for (const [k, v] of Object.entries(datasetOverrides)) {
      if (v != null && v !== "") (data as Record<string, unknown>)[k] = v;
    }
  }
  const keys = includeSources?.length
    ? ["slack", "git", "jira", "docs", "releases"].filter((k) => includeSources.includes(k))
    : ["slack", "git", "jira", "docs", "releases"];
  const parts: string[] = [];
  if (keys.includes("slack") && data.slack != null)
    parts.push("## Slack\n" + (typeof data.slack === "object" ? JSON.stringify(data.slack, null, 2) : String(data.slack)));
  if (keys.includes("git") && data.git != null)
    parts.push("## Git commits\n" + (typeof data.git === "object" ? JSON.stringify(data.git, null, 2) : String(data.git)));
  if (keys.includes("jira") && data.jira != null)
    parts.push("## Jira\n" + (typeof data.jira === "object" ? JSON.stringify(data.jira, null, 2) : String(data.jira)));
  if (keys.includes("docs") && data.docs != null) parts.push("## Documentation\n" + data.docs);
  if (keys.includes("releases") && data.releases != null) parts.push("## Release notes\n" + data.releases);
  return parts.join("\n\n") || "";
}

async function generate(
  system: string,
  user: string,
  jsonMode: boolean = true,
  modelOverride?: string
): Promise<string> {
  const ai = getGemini();
  const model = modelOverride ?? getModel();
  const contents = `${system}\n\n---\n\n${user}`;
  const config: Record<string, unknown> = jsonMode ? { responseMimeType: "application/json" } : {};
  const response = await ai.models.generateContent({
    model,
    contents,
    config: Object.keys(config).length ? config : undefined,
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    if ("text" in part && typeof (part as { text?: string }).text === "string" && (part as { text: string }).text.trim())
      texts.push((part as { text: string }).text.trim());
  }
  if (texts.length === 0) return "";
  for (let i = texts.length - 1; i >= 0; i--) {
    if (texts[i].includes("{") && texts[i].includes("}")) return texts[i];
  }
  return texts[texts.length - 1] ?? "";
}

export type InferVersionResult = {
  inferred_version: string;
  confidence: number;
  evidence: string[];
  ambiguity_note?: string;
};

export async function inferVersion(
  query: string,
  includeSources?: string[],
  datasetOverrides?: Record<string, unknown>
): Promise<InferVersionResult> {
  const prompt = loadPrompt("infer_version").replace("{{query}}", query);
  const context = buildContext(includeSources, datasetOverrides);
  const user = `Sources:\n${context}\n\nUser question: ${query}`;
  const raw = await generate(prompt, user, true);
  const out = extractJson(raw);
  return {
    inferred_version: typeof out.inferred_version === "string" ? out.inferred_version : "unknown",
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    evidence: Array.isArray(out.evidence) ? out.evidence.filter((e): e is string => typeof e === "string") : [],
    ambiguity_note: typeof out.ambiguity_note === "string" ? out.ambiguity_note : "",
  };
}

export type CausalResult = {
  root_cause: string;
  contradictions: string[];
  risk: string;
  fix_steps: string[];
  verification: string;
  sources: string[];
  reasoning_trace: string[];
  truth_gaps?: string[];
};

export async function causalReasoning(
  query: string,
  inferredVersion: string,
  includeSources?: string[],
  datasetOverrides?: Record<string, unknown>,
  priorContext?: string,
  imageBase64?: string,
  imageMime?: string
): Promise<CausalResult> {
  const promptTpl = loadPrompt("causal_reasoning");
  const priorBlock = priorContext?.trim()
    ? `\nPrior established knowledge (from this session):\n${priorContext.trim()}\n`
    : "";
  const prompt = promptTpl
    .replace("{{inferred_version}}", inferredVersion)
    .replace("{{query}}", query)
    .replace("{{prior_context_block}}", priorBlock);
  const context = buildContext(includeSources, datasetOverrides);
  let user = `Sources:\n${context}`;
  if (imageBase64) user += "\n\n[User attached an image/screenshot. Consider it when reasoning.]";
  const raw = await generate(prompt, user, true);
  const out = extractJson(raw);
  return {
    root_cause: typeof out.root_cause === "string" ? out.root_cause : "",
    contradictions: Array.isArray(out.contradictions) ? out.contradictions.filter((c): c is string => typeof c === "string") : [],
    risk: typeof out.risk === "string" ? out.risk : "",
    fix_steps: Array.isArray(out.fix_steps) ? out.fix_steps.filter((s): s is string => typeof s === "string") : [],
    verification: typeof out.verification === "string" ? out.verification : "",
    sources: Array.isArray(out.sources) ? out.sources.filter((s): s is string => typeof s === "string") : [],
    reasoning_trace: Array.isArray(out.reasoning_trace) ? out.reasoning_trace.filter((s): s is string => typeof s === "string") : [],
    truth_gaps: Array.isArray(out.truth_gaps) ? out.truth_gaps.filter((s): s is string => typeof s === "string") : [],
  };
}

export async function verifyContradiction(
  inferredVersion: string,
  contradictions: string[],
  includeSources?: string[],
  datasetOverrides?: Record<string, unknown>
): Promise<string[]> {
  if (!contradictions?.length) return [];
  const prompt = loadPrompt("verify_contradiction")
    .replace("{{inferred_version}}", inferredVersion)
    .replace("{{contradictions}}", JSON.stringify(contradictions));
  const context = buildContext(includeSources, datasetOverrides).slice(0, 2000);
  const user = `Sources (for context):\n${context}`;
  const raw = await generate(prompt, user, true);
  const out = extractJson(raw);
  const steps = out.verification_steps;
  return Array.isArray(steps) ? steps.filter((s): s is string => typeof s === "string") : [];
}

export type AskResult = {
  query: string;
  inferred_version: string;
  confidence: number;
  evidence: string[];
  ambiguity_note: string;
  root_cause: string;
  contradictions: string[];
  risk: string;
  fix_steps: string[];
  verification: string;
  sources: string[];
  source_details: { type: string; label: string; content: string }[];
  reasoning_trace: string[];
  truth_gaps: string[];
};

export async function ask(
  query: string,
  includeSources?: string[],
  datasetOverrides?: Record<string, unknown>,
  priorContext?: string,
  imageBase64?: string,
  imageMime?: string
): Promise<AskResult> {
  const versionResult = await inferVersion(query, includeSources, datasetOverrides);
  const inferred = versionResult.inferred_version;
  const causal = await causalReasoning(
    query,
    inferred,
    includeSources,
    datasetOverrides,
    priorContext,
    imageBase64,
    imageMime || "image/png"
  );
  const sourceDetails = getSourceDetails(causal.sources);
  return {
    query: query.trim(),
    inferred_version: inferred,
    confidence: versionResult.confidence,
    evidence: versionResult.evidence,
    ambiguity_note: versionResult.ambiguity_note ?? "",
    root_cause: causal.root_cause,
    contradictions: causal.contradictions,
    risk: causal.risk,
    fix_steps: causal.fix_steps,
    verification: causal.verification,
    sources: causal.sources,
    source_details: sourceDetails,
    reasoning_trace: causal.reasoning_trace,
    truth_gaps: causal.truth_gaps ?? [],
  };
}

export async function emitDocs(
  inferredVersion: string,
  causal: {
    root_cause?: string;
    contradictions?: string[];
    risk?: string;
    fix_steps?: string[];
    verification?: string;
    sources?: string[];
  }
): Promise<string> {
  const prompt = loadPrompt("emit_docs").replace("{{inferred_version}}", inferredVersion);
  const context = buildContext(undefined, undefined);
  const summary = JSON.stringify(causal, null, 2);
  const user = `Sources:\n${context}\n\nCausal analysis for this version:\n${summary}`;
  return (await generate(prompt, user, false)).trim();
}

export async function emitReconciliationPatch(
  findingId: string,
  target: string,
  action: string,
  causalSummary: string = ""
): Promise<string> {
  const prompt = loadPrompt("emit_reconciliation_patch")
    .replace("{{finding_id}}", findingId)
    .replace("{{target}}", target)
    .replace("{{action}}", action)
    .replace("{{causal_summary}}", causalSummary || "No prior causal summary provided.");
  const user = "Generate the reconciliation PR body or patch description as Markdown.";
  return (await generate(prompt, user, false)).trim();
}

export type ReconciliationBundle = {
  post_mortem: string;
  pr_diff: string;
  slack_summary: string;
};

export async function generateReconciliationBundle(causal: {
  inferred_version?: string;
  root_cause?: string;
  contradictions?: string[];
  risk?: string;
  fix_steps?: string[];
  verification?: string;
  sources?: string[];
}): Promise<ReconciliationBundle> {
  const prompt = loadPrompt("reconciliation_bundle")
    .replace("{{inferred_version}}", String(causal.inferred_version ?? "unknown"))
    .replace("{{root_cause}}", String(causal.root_cause ?? ""))
    .replace("{{contradictions}}", JSON.stringify(causal.contradictions ?? []))
    .replace("{{risk}}", String(causal.risk ?? ""))
    .replace("{{fix_steps}}", JSON.stringify(causal.fix_steps ?? []))
    .replace("{{verification}}", String(causal.verification ?? ""))
    .replace("{{sources}}", JSON.stringify(causal.sources ?? []));
  const user = "Generate the three artifacts as JSON. Return only valid JSON with keys: post_mortem, pr_diff, slack_summary.";
  const raw = await generate(prompt, user, true, getBundleModel());
  const out = extractJson(raw);
  return {
    post_mortem: (typeof out.post_mortem === "string" ? out.post_mortem : (out.incident_report as string) ?? "").trim() || "(No content generated.)",
    pr_diff: (typeof out.pr_diff === "string" ? out.pr_diff : (out.remedy_patch as string) ?? "").trim() || "(No content generated.)",
    slack_summary: (typeof out.slack_summary === "string" ? out.slack_summary : (out.stakeholder_summary as string) ?? "").trim() || "(No content generated.)",
  };
}

"""
Asktra Gemini client: single reasoning engine with high thinking for causal reconciliation.
Uses GEMINI_API_KEY and optional GEMINI_MODEL (e.g. gemini-2.5-pro-preview, gemini-3-flash-preview).
For Phase 0 (Semantic Intent Mapping) and Phase 7 (Causal Reconciliation), set GEMINI_THINKING_LEVEL=HIGH
to enable extended reasoning (thought chain) before answering — critical for Truth Gap detection.
"""
import base64
import os
import json
import re
import time
from pathlib import Path
from typing import Any, Optional

# Prefer google-genai; fallback for older envs
try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False


def _load_dataset() -> dict[str, Any]:
    base = Path(__file__).parent / "dataset"
    data = {}
    for name, path in [
        ("slack", base / "slack.json"),
        ("git", base / "git.json"),
        ("jira", base / "jira.json"),
        ("releases", base / "releases.md"),
        ("docs", base / "docs.md"),
    ]:
        if path.exists():
            if path.suffix == ".json":
                data[name] = json.loads(path.read_text(encoding="utf-8"))
            else:
                data[name] = path.read_text(encoding="utf-8")
    return data


def get_dataset_for_api() -> dict[str, Any]:
    """Return current dataset for GET /dataset (so frontend can show and edit)."""
    return _load_dataset()


def _load_prompt(name: str) -> str:
    path = Path(__file__).parent / "prompts" / f"{name}.txt"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {}
    # Try direct parse first (API may return pure JSON)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown code block if present
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Find first { ... } by brace matching
    start = text.find("{")
    if start == -1:
        return {}
    depth = 0
    end = -1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}


def _fallback_post_mortem(causal: dict[str, Any]) -> str:
    """Minimal incident report when the model returns empty."""
    root = causal.get("root_cause") or "Not determined."
    risk = causal.get("risk") or "See root cause."
    steps = causal.get("fix_steps") or []
    lines = [
        "# Incident report (fallback)",
        "",
        "## Root cause",
        str(root),
        "",
        "## Risk",
        str(risk),
        "",
        "## Recommended fix steps",
    ]
    for i, s in enumerate(steps[:5], 1):
        lines.append(f"{i}. {s}")
    return "\n".join(lines)


def _fallback_pr_diff(causal: dict[str, Any]) -> str:
    """Minimal PR diff summary when the model returns empty."""
    root = causal.get("root_cause") or ""
    steps = causal.get("fix_steps") or []
    lines = [
        "# Remedy patch (fallback)",
        "",
        "## Summary",
        root or "No root cause provided. Run a query and generate the bundle again.",
        "",
        "## Suggested changes",
    ]
    for s in steps[:5]:
        lines.append(f"- {s}")
    return "\n".join(lines)


def _fallback_slack_summary(causal: dict[str, Any]) -> str:
    """Minimal Slack summary when the model returns empty."""
    root = causal.get("root_cause") or "Unknown"
    risk = causal.get("risk") or "See investigation."
    return (
        f"Causal analysis complete. Root cause: {root[:200]}{'…' if len(root) > 200 else ''}. "
        f"Risk: {risk[:150]}{'…' if len(risk) > 150 else ''}. "
        "Review the Reconciliation Bundle for full post-mortem and PR diff."
    )


class GeminiClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model = model or os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
        self._client = None
        self._dataset = None

    @property
    def client(self):
        if not HAS_GENAI:
            raise RuntimeError("Install google-genai: pip install google-genai")
        if self._client is None:
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def get_dataset(self) -> dict[str, Any]:
        if self._dataset is None:
            self._dataset = _load_dataset()
        return self._dataset

    def _normalize_override(self, value: Any, key: str) -> Any:
        """Parse override: JSON string for slack/git/jira, else string."""
        if value is None:
            return None
        if key in ("slack", "git", "jira"):
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
            return value
        return value if isinstance(value, str) else str(value)

    def _build_context(
        self,
        include_sources: list[str] | None = None,
        dataset_overrides: dict[str, Any] | None = None,
    ) -> str:
        data = dict(self.get_dataset())
        if dataset_overrides:
            for k, v in dataset_overrides.items():
                if v is not None and v != "":
                    data[k] = self._normalize_override(v, k)
        keys = ["slack", "git", "jira", "docs", "releases"]
        if include_sources:
            keys = [k for k in keys if k in include_sources]
        parts = []
        if "slack" in keys and data.get("slack") is not None:
            val = data["slack"]
            parts.append("## Slack\n" + (json.dumps(val, indent=2) if isinstance(val, (dict, list)) else str(val)))
        if "git" in keys and data.get("git") is not None:
            val = data["git"]
            parts.append("## Git commits\n" + (json.dumps(val, indent=2) if isinstance(val, (dict, list)) else str(val)))
        if "jira" in keys and data.get("jira") is not None:
            val = data["jira"]
            parts.append("## Jira\n" + (json.dumps(val, indent=2) if isinstance(val, (dict, list)) else str(val)))
        if "docs" in keys and data.get("docs") is not None:
            parts.append("## Documentation\n" + str(data["docs"]))
        if "releases" in keys and data.get("releases") is not None:
            parts.append("## Release notes\n" + str(data["releases"]))
        return "\n\n".join(parts) if parts else ""

    def _generate(
        self,
        system: str,
        user: str,
        json_mode: bool = True,
        image_base64: str | None = None,
        image_mime: str = "image/png",
        use_thinking: bool = True,
    ) -> str:
        contents: Any = f"{system}\n\n---\n\n{user}"
        if image_base64 and image_base64.strip():
            try:
                image_bytes = base64.b64decode(image_base64, validate=True)
                if hasattr(types, "Part") and hasattr(types.Part, "from_text"):
                    text_part = types.Part.from_text(contents)
                    if hasattr(types.Part, "from_bytes"):
                        image_part = types.Part.from_bytes(data=image_bytes, mime_type=image_mime or "image/png")
                    else:
                        image_part = types.Part(inline_data=types.Blob(mime_type=image_mime or "image/png", data=image_bytes))
                    parts_list = [text_part, image_part]
                    if hasattr(types, "Content"):
                        contents = [types.Content(role="user", parts=parts_list)]
                    else:
                        contents = parts_list
                elif hasattr(types, "Part") and hasattr(types, "Blob"):
                    parts_list = [
                        types.Part(text=contents),
                        types.Part(inline_data=types.Blob(mime_type=image_mime or "image/png", data=image_bytes)),
                    ]
                    if hasattr(types, "Content"):
                        contents = [types.Content(role="user", parts=parts_list)]
                    else:
                        contents = parts_list
            except Exception:
                pass
        config_kw: dict[str, Any] = {}
        if json_mode:
            try:
                config_kw["response_mime_type"] = "application/json"
            except Exception:
                pass
        # Phase 0 / Phase 7: extended reasoning (skip for bundle to avoid overload/empty response)
        if use_thinking:
            thinking_level = os.environ.get("GEMINI_THINKING_LEVEL", "").strip().upper()
            if thinking_level == "HIGH" and hasattr(types, "ThinkingConfig"):
                try:
                    config_kw["thinking_config"] = types.ThinkingConfig(thinking_level="HIGH")
                except Exception:
                    pass
        try:
            config = types.GenerateContentConfig(**config_kw) if config_kw else None
        except Exception:
            config = types.GenerateContentConfig(response_mime_type="application/json") if json_mode else None
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )
        except Exception as e:
            err = str(e).upper()
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "QUOTA" in err:
                raise RuntimeError(
                    "Gemini API quota exceeded for this model. Try: (1) Wait ~1 min and retry, "
                    "(2) Set GEMINI_MODEL to another model in .env (e.g. gemini-2.5-flash or gemini-3-flash-preview), "
                    "(3) Check usage: https://ai.dev/rate-limit"
                ) from e
            raise
        if not response or not response.candidates:
            return ""
        parts = getattr(response.candidates[0].content, "parts", None) or []
        # When thinking is enabled, parts can be [thought_part, ..., text_part]. Use the part that looks like JSON (main output).
        text_parts = []
        for p in parts:
            t = getattr(p, "text", None) if p else None
            if t and isinstance(t, str) and t.strip():
                text_parts.append((p, t.strip()))
        if not text_parts:
            first = parts[0] if parts else None
            return getattr(first, "text", None) or str(first) if first else ""
        # Prefer the chunk that contains JSON (actual response); otherwise use last (main answer usually last).
        for _p, t in reversed(text_parts):
            if "{" in t and "}" in t and ("post_mortem" in t or "pr_diff" in t or "slack_summary" in t):
                return t
        for _p, t in reversed(text_parts):
            if "{" in t and "}" in t:
                return t
        # If multiple parts, concatenate in case JSON was split (e.g. thinking models)
        if len(text_parts) > 1:
            combined = "\n".join(t for _, t in text_parts)
            if "post_mortem" in combined or "pr_diff" in combined:
                return combined
        return text_parts[-1][1]

    def infer_version(
        self,
        query: str,
        include_sources: list[str] | None = None,
        dataset_overrides: dict[str, Any] | None = None,
        image_base64: str | None = None,
        image_mime: str = "image/png",
    ) -> dict[str, Any]:
        prompt = _load_prompt("infer_version").replace("{{query}}", query)
        context = self._build_context(include_sources, dataset_overrides)
        user = f"Sources:\n{context}\n\nUser question: {query}"
        if image_base64:
            user += "\n\n[User attached an image/screenshot. Consider it when inferring version and evidence.]"
        raw = self._generate(prompt, user, json_mode=True, image_base64=image_base64, image_mime=image_mime)
        out = _extract_json(raw)
        return {
            "inferred_version": out.get("inferred_version", "unknown"),
            "confidence": float(out.get("confidence", 0)),
            "evidence": out.get("evidence", []),
            "ambiguity_note": out.get("ambiguity_note", ""),
        }

    def causal_reasoning(
        self,
        query: str,
        inferred_version: str,
        include_sources: list[str] | None = None,
        dataset_overrides: dict[str, Any] | None = None,
        prior_context: str | None = None,
        image_base64: str | None = None,
        image_mime: str = "image/png",
    ) -> dict[str, Any]:
        prompt = _load_prompt("causal_reasoning")
        prompt = prompt.replace("{{inferred_version}}", inferred_version).replace("{{query}}", query)
        prior_block = ""
        if prior_context and prior_context.strip():
            prior_block = f"\nPrior established knowledge (from this session):\n{prior_context.strip()}\n"
        prompt = prompt.replace("{{prior_context_block}}", prior_block)
        context = self._build_context(include_sources, dataset_overrides)
        user = f"Sources:\n{context}"
        if image_base64:
            user += "\n\n[User attached an image/screenshot (e.g. dashboard, latency graph). Does it align with the inferred version and timeout changes? Confirm or note discrepancies.]"
        raw = self._generate(prompt, user, json_mode=True, image_base64=image_base64, image_mime=image_mime)
        out = _extract_json(raw)
        return {
            "root_cause": out.get("root_cause", ""),
            "contradictions": out.get("contradictions", []),
            "risk": out.get("risk", ""),
            "fix_steps": out.get("fix_steps", []),
            "verification": out.get("verification", ""),
            "sources": out.get("sources", []),
            "reasoning_trace": out.get("reasoning_trace", []),
            "truth_gaps": out.get("truth_gaps", []),
        }

    def emit_docs(self, inferred_version: str, causal: dict[str, Any]) -> str:
        prompt = _load_prompt("emit_docs").replace("{{inferred_version}}", inferred_version)
        context = self._build_context()
        summary = json.dumps(causal, indent=2)
        user = f"Sources:\n{context}\n\nCausal analysis for this version:\n{summary}"
        return self._generate(prompt, user, json_mode=False).strip()

    def emit_reconciliation_patch(
        self,
        finding_id: str,
        target: str,
        action: str,
        causal_summary: str = "",
    ) -> str:
        """Generate a PR body or patch description for a reconciliation finding (e.g. doc drift)."""
        prompt = _load_prompt("emit_reconciliation_patch")
        prompt = (
            prompt.replace("{{finding_id}}", finding_id)
            .replace("{{target}}", target)
            .replace("{{action}}", action)
            .replace("{{causal_summary}}", causal_summary or "No prior causal summary provided.")
        )
        user = "Generate the reconciliation PR body or patch description as Markdown."
        return self._generate(prompt, user, json_mode=False).strip()

    def verify_contradiction(
        self,
        inferred_version: str,
        contradictions: list[str],
        include_sources: list[str] | None = None,
        dataset_overrides: dict[str, Any] | None = None,
    ) -> list[str]:
        """Self-correction loop: generate verification steps when contradictions exist (e.g. grep simulation, confirm outlier)."""
        if not contradictions:
            return []
        prompt = _load_prompt("verify_contradiction")
        prompt = (
            prompt.replace("{{inferred_version}}", inferred_version)
            .replace("{{contradictions}}", json.dumps(contradictions))
        )
        context = self._build_context(include_sources, dataset_overrides)
        user = f"Sources (for context):\n{context[:2000]}"
        raw = self._generate(prompt, user, json_mode=True)
        out = _extract_json(raw)
        steps = out.get("verification_steps", [])
        return steps if isinstance(steps, list) else []

    def generate_reconciliation_bundle(self, causal: dict[str, Any]) -> dict[str, str]:
        """Generate post_mortem (Markdown), pr_diff (Markdown), slack_summary (text) for the team.
        Uses use_thinking=False for reliability. Retries up to 3 times on empty; raises if no real content."""
        prompt = _load_prompt("reconciliation_bundle")
        prompt = (
            prompt.replace("{{inferred_version}}", str(causal.get("inferred_version", "unknown")))
            .replace("{{root_cause}}", str(causal.get("root_cause", "")))
            .replace("{{contradictions}}", json.dumps(causal.get("contradictions") or []))
            .replace("{{risk}}", str(causal.get("risk", "")))
            .replace("{{fix_steps}}", json.dumps(causal.get("fix_steps") or []))
            .replace("{{verification}}", str(causal.get("verification", "")))
            .replace("{{sources}}", json.dumps(causal.get("sources") or []))
        )
        user = "Generate the three artifacts as JSON. Return only valid JSON with keys: post_mortem, pr_diff, slack_summary."
        use_fallback = os.environ.get("USE_BUNDLE_FALLBACK", "").strip().upper() in ("1", "TRUE", "YES")
        # Use thinking for Gemini 3 so we get full model output; skip for other models
        use_thinking = "gemini-3" in (self.model or "").lower()
        for attempt in range(3):
            raw = self._generate(prompt, user, json_mode=True, use_thinking=use_thinking)
            out = _extract_json(raw)
            post_mortem = (out.get("post_mortem") or out.get("incident_report") or "").strip()
            pr_diff = (out.get("pr_diff") or out.get("remedy_patch") or "").strip()
            slack_summary = (out.get("slack_summary") or out.get("stakeholder_summary") or "").strip()
            if post_mortem or pr_diff or slack_summary:
                return {
                    "post_mortem": post_mortem or "(No content generated for this section.)",
                    "pr_diff": pr_diff or "(No content generated for this section.)",
                    "slack_summary": slack_summary or "(No content generated for this section.)",
                }
            if attempt < 2:
                time.sleep(1 * (attempt + 1))
                continue
            if use_fallback:
                post_mortem = _fallback_post_mortem(causal)
                pr_diff = _fallback_pr_diff(causal)
                slack_summary = _fallback_slack_summary(causal)
                return {
                    "post_mortem": post_mortem,
                    "pr_diff": pr_diff,
                    "slack_summary": slack_summary,
                }
            raise RuntimeError(
                "Model returned empty bundle. Please try again in a moment (Gemini may be busy). "
                "To allow fallback content, set USE_BUNDLE_FALLBACK=1 in .env."
            )
        raise RuntimeError("Model returned empty bundle; please try again later.")


def ask(
    gemini: GeminiClient,
    query: str,
    include_sources: list[str] | None = None,
    dataset_overrides: dict[str, Any] | None = None,
    prior_context: str | None = None,
    image_base64: str | None = None,
    image_mime: str = "image/png",
) -> dict[str, Any]:
    version_result = gemini.infer_version(query, include_sources, dataset_overrides, image_base64, image_mime)
    inferred = version_result["inferred_version"]
    causal = gemini.causal_reasoning(
        query, inferred, include_sources, dataset_overrides, prior_context, image_base64, image_mime
    )
    return {
        "query": query,
        "inferred_version": inferred,
        "confidence": version_result["confidence"],
        "evidence": version_result["evidence"],
        "ambiguity_note": version_result.get("ambiguity_note", ""),
        "root_cause": causal["root_cause"],
        "contradictions": causal["contradictions"],
        "risk": causal["risk"],
        "fix_steps": causal["fix_steps"],
        "verification": causal["verification"],
        "sources": causal["sources"],
        "reasoning_trace": causal["reasoning_trace"],
        "truth_gaps": causal.get("truth_gaps", []),
    }


def emit_docs(gemini: GeminiClient, inferred_version: str, causal: dict[str, Any]) -> str:
    return gemini.emit_docs(inferred_version, causal)


def emit_reconciliation_patch(
    gemini: GeminiClient,
    finding_id: str,
    target: str,
    action: str,
    causal_summary: str = "",
) -> str:
    return gemini.emit_reconciliation_patch(finding_id, target, action, causal_summary)


def generate_reconciliation_bundle(gemini: GeminiClient, causal: dict[str, Any]) -> dict[str, str]:
    return gemini.generate_reconciliation_bundle(causal)

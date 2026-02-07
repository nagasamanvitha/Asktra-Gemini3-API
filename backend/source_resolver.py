"""
Resolve source labels (e.g. "Slack 2025-09-12", "Commit 8a2f") to type + content from dataset.
"""
import json
import re
from pathlib import Path


def _load_dataset():
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


def get_source_details(sources: list[str]) -> list[dict]:
    """Turn a list of source labels into [{ type, label, content }, ...] for the UI."""
    if not sources:
        return []
    data = _load_dataset()
    out = []
    seen = set()

    for raw in sources:
        s = (raw or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        entry = None
        typ = "document"
        content = ""

        # Slack: "Slack 2025-09-12", "Slack#security-alerts"
        if re.search(r"slack|#\w+", s, re.I):
            typ = "slack"
            for item in data.get("slack", []):
                date = item.get("date", "")
                ch = item.get("channel", "")
                if date in s or (ch and ch in s):
                    content = f"[{item.get('date', '')}] #{item.get('channel', '')} — {item.get('author', '')}: {item.get('message', '')}"
                    entry = {"type": typ, "label": s, "content": content}
                    break
            if not entry and data.get("slack"):
                item = data["slack"][0]
                content = f"[{item.get('date', '')}] #{item.get('channel', '')} — {item.get('author', '')}: {item.get('message', '')}"
                entry = {"type": typ, "label": s, "content": content}

        # Git: "Commit 8a2f", "8a2f"
        if not entry and re.search(r"commit|[\da-f]{4,}", s, re.I):
            for item in data.get("git", []):
                h = (item.get("hash") or item.get("short_hash") or "").lower()
                short = (item.get("short_hash") or item.get("hash", "")[:7] or "").lower()
                if h and (h in s.lower() or s.lower().endswith(h) or short in s.lower() or s.lower().endswith(short)):
                    typ = "git"
                    diff = item.get("diff", "")
                    content = f"commit {item.get('hash', item.get('short_hash', ''))} ({item.get('date', '')}) — {item.get('author', '')}\n  {item.get('message', '')}\n  {item.get('change', '')}"
                    if diff:
                        content += f"\n  Diff:\n  {diff}"
                    entry = {"type": typ, "label": s, "content": content}
                    break

        # Jira: "SEC-442", "AUTH-101"
        if not entry and re.search(r"(SEC|AUTH|JIRA|PROJ)-\d+", s, re.I):
            typ = "jira"
            for item in data.get("jira", []):
                jid = (item.get("id") or "").upper()
                if jid and jid in s.upper():
                    content = f"{item.get('id', '')} — {item.get('title', '')} ({item.get('status', '')})\n  {item.get('comment', '')}"
                    entry = {"type": typ, "label": s, "content": content}
                    break

        # Doc / releases: fallback
        if not entry:
            typ = "document"
            if data.get("docs"):
                content = (data["docs"] or "").strip()[:800]
                if data.get("releases"):
                    content += "\n\n---\n\n" + (data["releases"] or "").strip()[:400]
            else:
                content = s
            entry = {"type": typ, "label": s, "content": content or s}

        if entry:
            out.append(entry)

    return out

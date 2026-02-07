import type { Dataset } from "./data";
import { getDataset } from "./data";

export type SourceDetail = { type: string; label: string; content: string };

export function getSourceDetails(sources: string[], dataset?: Dataset): SourceDetail[] {
  if (!sources?.length) return [];
  const data = dataset ?? getDataset();
  const out: SourceDetail[] = [];
  const seen = new Set<string>();

  for (const raw of sources) {
    const s = (raw || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    let entry: SourceDetail | null = null;
    let typ = "document";
    let content = "";

    if (/slack|#\w+/i.test(s)) {
      typ = "slack";
      const slack = Array.isArray(data.slack) ? data.slack : [];
      for (const item of slack) {
        const date = (item as { date?: string }).date ?? "";
        const ch = (item as { channel?: string }).channel ?? "";
        if (date && s.includes(date)) {
          content = `[${date}] #${ch} — ${(item as { author?: string }).author ?? ""}: ${(item as { message?: string }).message ?? ""}`;
          entry = { type: typ, label: s, content };
          break;
        }
      }
      if (!entry && slack[0]) {
        const item = slack[0] as { date?: string; channel?: string; author?: string; message?: string };
        content = `[${item.date ?? ""}] #${item.channel ?? ""} — ${item.author ?? ""}: ${item.message ?? ""}`;
        entry = { type: typ, label: s, content };
      }
    }

    if (!entry && /commit|[\da-f]{4,}/i.test(s)) {
      const git = Array.isArray(data.git) ? data.git : [];
      for (const item of git) {
        const h = ((item as { hash?: string }).hash ?? (item as { short_hash?: string }).short_hash ?? "").toLowerCase();
        const short = ((item as { short_hash?: string }).short_hash ?? (item as { hash?: string }).hash?.slice(0, 7) ?? "").toLowerCase();
        if (h && (s.toLowerCase().includes(h) || s.toLowerCase().endsWith(h) || s.toLowerCase().includes(short))) {
          typ = "git";
          const it = item as { hash?: string; short_hash?: string; date?: string; author?: string; message?: string; change?: string; diff?: string };
          content = `commit ${it.hash ?? it.short_hash ?? ""} (${it.date ?? ""}) — ${it.author ?? ""}\n  ${it.message ?? ""}\n  ${it.change ?? ""}`;
          if (it.diff) content += `\n  Diff:\n  ${it.diff}`;
          entry = { type: typ, label: s, content };
          break;
        }
      }
    }

    if (!entry && /(SEC|AUTH|JIRA|PROJ)-\d+/i.test(s)) {
      typ = "jira";
      const jira = Array.isArray(data.jira) ? data.jira : [];
      for (const item of jira) {
        const jid = ((item as { id?: string }).id ?? "").toUpperCase();
        if (jid && s.toUpperCase().includes(jid)) {
          const it = item as { id?: string; title?: string; status?: string; comment?: string };
          content = `${it.id ?? ""} — ${it.title ?? ""} (${it.status ?? ""})\n  ${it.comment ?? ""}`;
          entry = { type: typ, label: s, content };
          break;
        }
      }
    }

    if (!entry) {
      typ = "document";
      content = (data.docs ?? "").trim().slice(0, 800);
      if (data.releases) content += "\n\n---\n\n" + (data.releases ?? "").trim().slice(0, 400);
      if (!content) content = s;
      entry = { type: typ, label: s, content: content || s };
    }

    if (entry) out.push(entry);
  }
  return out;
}

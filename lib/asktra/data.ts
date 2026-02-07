/**
 * Load dataset and prompts from backend/ (same files as Python app).
 * Server-only: use in API routes.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, "backend");
const DATASET_DIR = path.join(BACKEND, "dataset");
const PROMPTS_DIR = path.join(BACKEND, "prompts");

export type Dataset = {
  slack?: unknown;
  git?: unknown;
  jira?: unknown;
  docs?: string;
  releases?: string;
};

function readFile(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

function loadDataset(): Dataset {
  const data: Dataset = {};
  const entries: [keyof Dataset, string][] = [
    ["slack", path.join(DATASET_DIR, "slack.json")],
    ["git", path.join(DATASET_DIR, "git.json")],
    ["jira", path.join(DATASET_DIR, "jira.json")],
    ["releases", path.join(DATASET_DIR, "releases.md")],
    ["docs", path.join(DATASET_DIR, "docs.md")],
  ];
  for (const [name, filePath] of entries) {
    if (!fs.existsSync(filePath)) continue;
    const raw = readFile(filePath);
    if (name === "docs" || name === "releases") {
      (data as Record<string, string>)[name] = raw;
    } else {
      try {
        (data as Record<string, unknown>)[name] = JSON.parse(raw);
      } catch {
        (data as Record<string, unknown>)[name] = raw;
      }
    }
  }
  return data;
}

export function getDataset(): Dataset {
  return loadDataset();
}

export function loadPrompt(name: string): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.txt`);
  return fs.existsSync(filePath) ? readFile(filePath) : "";
}

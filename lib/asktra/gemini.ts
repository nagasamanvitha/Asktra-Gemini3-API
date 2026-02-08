import { GoogleGenAI } from "@google/genai";

export function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const BUNDLE_MODEL = process.env.GEMINI_BUNDLE_MODEL ?? MODEL;

export function getModel() {
  return MODEL;
}

export function getBundleModel() {
  return BUNDLE_MODEL;
}

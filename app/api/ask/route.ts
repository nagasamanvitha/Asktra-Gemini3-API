import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/asktra/asktraEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ detail: "query required" }, { status: 400 });
    }
    const result = await ask(
      query,
      body.include_sources,
      body.dataset_overrides,
      body.prior_context,
      body.image_base64,
      body.image_mime || "image/png"
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("GEMINI_API_KEY") || msg.includes("not set")) {
      return NextResponse.json({ detail: msg }, { status: 503 });
    }
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { emitDocs } from "@/lib/asktra/asktraEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const markdown = await emitDocs(body.inferred_version ?? "unknown", {
      root_cause: body.root_cause,
      contradictions: body.contradictions,
      risk: body.risk,
      fix_steps: body.fix_steps,
      verification: body.verification,
      sources: body.sources,
    });
    return NextResponse.json({ markdown });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

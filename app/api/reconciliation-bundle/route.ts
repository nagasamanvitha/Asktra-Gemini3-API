import { NextRequest, NextResponse } from "next/server";
import { generateReconciliationBundle } from "@/lib/asktra/asktraEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bundle = await generateReconciliationBundle({
      inferred_version: body.inferred_version,
      root_cause: body.root_cause,
      contradictions: body.contradictions,
      risk: body.risk,
      fix_steps: body.fix_steps,
      verification: body.verification,
      sources: body.sources,
    });
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

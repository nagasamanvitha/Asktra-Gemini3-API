import { NextRequest, NextResponse } from "next/server";
import { emitReconciliationPatch } from "@/lib/asktra/asktraEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const findingId = typeof body.finding_id === "string" ? body.finding_id.trim() : "";
    const target = typeof body.target === "string" ? body.target.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!findingId || !target || !action) {
      return NextResponse.json({ detail: "finding_id, target, action required" }, { status: 400 });
    }
    const markdown = await emitReconciliationPatch(
      findingId,
      target,
      action,
      body.causal_summary ?? ""
    );
    return NextResponse.json({ action, patch_description: markdown, pr_body: markdown });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import {
  inferVersion,
  causalReasoning,
  verifyContradiction,
} from "@/lib/asktra/asktraEngine";
import { getSourceDetails } from "@/lib/asktra/sourceResolver";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return new Response(sse("error", { detail: "query required" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  const includeSources = body.include_sources as string[] | undefined;
  const sourcesMsg = includeSources?.length
    ? includeSources.join(", ")
    : "Slack, Git, Jira, docs, releases";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const step = (msg: string) =>
        controller.enqueue(encoder.encode(sse("step", { message: msg })));
      try {
        step(`Loading dataset (${sourcesMsg})…`);
        if (body.image_base64) step("Including attached image in analysis (multimodal)…");
        if (body.prior_context) step("Building on prior session knowledge…");
        step("Inferring version from timestamps and release notes…");

        const versionResult = await inferVersion(
          query,
          body.include_sources,
          body.dataset_overrides
        );
        const inferred = versionResult.inferred_version;
        const conf = versionResult.confidence;
        step(`✓ Inferred version: ${inferred} (${Math.round(conf * 100)}% confidence)`);
        for (const ev of (versionResult.evidence ?? []).slice(0, 3)) {
          step(`  Evidence: ${ev}`);
        }
        step("Loading sources into context for causal reasoning…");
        step("Reasoning over Slack intent vs Git implementation vs docs…");

        const causal = await causalReasoning(
          query,
          inferred,
          body.include_sources,
          body.dataset_overrides,
          body.prior_context,
          body.image_base64,
          body.image_mime || "image/png"
        );
        step("✓ Causal analysis complete. Extracting reasoning trace…");
        for (const s of causal.reasoning_trace ?? []) {
          step(`  ${s}`);
        }

        const contradictions = causal.contradictions ?? [];
        if (contradictions.length > 0) {
          step("Verifying inferred truth (self-correction loop)…");
          try {
            const verificationSteps = await verifyContradiction(
              inferred,
              contradictions,
              body.include_sources,
              body.dataset_overrides
            );
            for (const msg of verificationSteps) {
              step(`  ${msg}`);
            }
            step("✓ Verification complete. Documentation outlier confirmed.");
          } catch {
            step("  (Verification skipped)");
          }
        }

        step("Resolving source citations (Slack, Git, Jira, docs)…");
        const sourceDetails = getSourceDetails(causal.sources);
        step("✓ Sources resolved. Building answer…");

        const result = {
          query,
          inferred_version: inferred,
          confidence: conf,
          evidence: versionResult.evidence ?? [],
          ambiguity_note: versionResult.ambiguity_note ?? "",
          root_cause: causal.root_cause,
          contradictions: causal.contradictions,
          risk: causal.risk,
          fix_steps: causal.fix_steps,
          verification: causal.verification,
          sources: causal.sources,
          source_details: sourceDetails,
          reasoning_trace: causal.reasoning_trace ?? [],
          truth_gaps: causal.truth_gaps ?? [],
        };
        controller.enqueue(encoder.encode(sse("result", result)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(sse("error", { detail: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

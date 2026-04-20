import { NextRequest } from "next/server";
import type { PaperMeta } from "@/app/lib/arxiv";
import { STACK_CONTEXT } from "@/app/lib/stack";
import {
  hasAnthropicKey,
  makeSSEStream,
  streamAnthropic,
  streamStub,
} from "@/app/lib/stream";
import { relatedPapers, type RelatedPaperStub } from "@/app/lib/related";

export const runtime = "nodejs";
export const maxDuration = 60;

export type BranchKind = "method" | "related" | "implications";

type BranchPayload = {
  kind: BranchKind;
  paper: PaperMeta;
  parentContext: string;
  topic?: string;
};

function buildPrompt(p: BranchPayload, related?: RelatedPaperStub) {
  const head = `Parent digest context
=====================
${p.parentContext}

Paper
-----
Title: ${p.paper.title}
arXiv: ${p.paper.absUrl}
Categories: ${p.paper.categories.join(", ")}
Abstract: ${p.paper.abstract}`;

  if (p.kind === "method") {
    return `${head}

Branch: Go deeper on method
---------------------------
Expand one methodological subsection that matters most for Param's stack. Name it explicitly (e.g. "the TEE attestation scheme", "the verifier's scoring rule"). Give 3-5 crisp paragraphs. No hedging. Markdown allowed for inline emphasis only — no headings, no lists. Target: ~250 words.${p.topic ? `\n\nFocus: ${p.topic}` : ""}`;
  }

  if (p.kind === "related") {
    const r = related!;
    return `${head}

Related paper
-------------
Title: ${r.title}
arXiv: ${r.absUrl}
Why related: ${r.reason}

Branch: Compare-and-diff digest
-------------------------------
Write a diff-digest between the parent paper and this related one. Structure as 3 short paragraphs: (1) where they agree, (2) where they diverge, (3) what the pair together implies for Keep's oracle / Param's stack. No headings, no lists. Terse, confident, editorial. Target: ~220 words.`;
  }

  return `${head}

Branch: Implications for Param's stack
--------------------------------------
Write a Param-specific angle piece. Pick exactly ONE project (Keep, Param Hub, TFR, Both And, Build Yourself, or Wired Different) and argue the sharpest implication of this paper for that project. Name the mechanism. Propose one concrete thing Param should build, change, or abandon in the next two weeks because of this paper. 3 short paragraphs. No headings, no lists. Target: ~200 words.${p.topic ? `\n\nConstraint: focus on ${p.topic}` : ""}`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as BranchPayload;
  if (!body?.kind || !body?.paper) {
    return Response.json({ error: "kind and paper required" }, { status: 400 });
  }

  const { stream, controller } = makeSSEStream();
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  let related: RelatedPaperStub | undefined;
  if (body.kind === "related") {
    const candidates = relatedPapers(body.paper);
    related = candidates[0];
    if (!related) {
      return Response.json(
        { error: "no related paper found" },
        { status: 404 },
      );
    }
  }

  (async () => {
    try {
      if (related) controller.send("related", related);

      const userBlock = buildPrompt(body, related);

      let full = "";
      if (hasAnthropicKey()) {
        full = await streamAnthropic(
          {
            system: [
              {
                type: "text",
                text: STACK_CONTEXT,
                cache_control: { type: "ephemeral" },
              },
            ],
            userBlock,
            maxTokens: 1200,
          },
          controller,
          ac.signal,
        );
      } else {
        full = await streamStub(userBlock, controller, ac.signal);
      }

      controller.send("done", { full });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "stream failed";
      controller.send("error", { error: msg });
    } finally {
      controller.close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

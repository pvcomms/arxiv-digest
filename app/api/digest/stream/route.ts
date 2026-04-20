import { NextRequest } from "next/server";
import { fetchArxivPaper, parseArxivId } from "@/app/lib/arxiv";
import { STACK_CONTEXT } from "@/app/lib/stack";
import {
  hasAnthropicKey,
  makeSSEStream,
  streamAnthropic,
  streamStub,
} from "@/app/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { url } = (await req.json()) as { url?: string };
  if (!url) {
    return Response.json({ error: "url required" }, { status: 400 });
  }
  const id = parseArxivId(url);
  if (!id) {
    return Response.json(
      { error: "not a recognized arxiv URL or id" },
      { status: 400 },
    );
  }

  const paper = await fetchArxivPaper(id);
  const { stream, controller } = makeSSEStream();
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  (async () => {
    try {
      controller.send("paper", paper);

      const userBlock = `Paper
=====
Title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Published: ${paper.published}
Categories: ${paper.categories.join(", ")}
arXiv: ${paper.absUrl}

Abstract
--------
${paper.abstract}

Task
----
Write a digest for Param. Return ONLY valid JSON matching this TypeScript type — no prose before or after, no markdown fences:

{
  "verdict": "must-read" | "worth-skimming" | "skip",
  "tldr": string,
  "why_it_matters": string,
  "connections": Array<{
    "project": "Keep" | "Param Hub" | "TFR" | "Both And" | "Build Yourself" | "Wired Different",
    "angle": string
  }>,
  "steal": string[],
  "skepticism": string,
  "questions": string[]
}`;

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

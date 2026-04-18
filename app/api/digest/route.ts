import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { fetchArxivPaper, parseArxivId, type PaperMeta } from "@/app/lib/arxiv";
import { STACK_CONTEXT } from "@/app/lib/stack";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic();

type DigestBody = {
  verdict: "must-read" | "worth-skimming" | "skip";
  tldr: string;
  why_it_matters: string;
  connections: Array<{
    project:
      | "Keep"
      | "Param Hub"
      | "TFR"
      | "Both And"
      | "Build Yourself"
      | "Wired Different";
    angle: string;
  }>;
  steal: string[];
  skepticism: string;
  questions: string[];
};

export async function POST(req: NextRequest) {
  try {
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
    const digest = await generateDigest(paper);

    return Response.json({ paper, digest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function generateDigest(paper: PaperMeta): Promise<DigestBody> {
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
  "tldr": string,                                  // 2 sentences. What the paper does + what they found. No hedging.
  "why_it_matters": string,                        // 3-4 sentences. Place it in the landscape. What it unlocks or closes. Skip if verdict is "skip" — still fill, but make it a case for why to skip.
  "connections": Array<{                           // 1-4 entries. Only include projects where the connection is CONCRETE, not "might inspire." Prefer Keep when the paper touches biometrics/oracles/markets.
    "project": "Keep" | "Param Hub" | "TFR" | "Both And" | "Build Yourself" | "Wired Different",
    "angle": string                                // 1-2 sentences. Name the mechanism. E.g. "Their TEE-signed wearable attestation scheme is a template for Keep's oracle — user signs HRV locally, we verify on-chain without seeing raw data."
  }>,
  "steal": string[],                               // 2-4 items. Specific things Param can lift: an algorithm, a UI pattern, an experiment design, a framing. Each item one tight sentence.
  "skepticism": string,                            // 2-3 sentences. The honest counter-argument. Sample size, ecological validity, whether the finding replicates, whether the authors oversell.
  "questions": string[]                            // 2-3 open questions this paper raises for Param's work.
}`;

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: STACK_CONTEXT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userBlock }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJson(text);
  return JSON.parse(json) as DigestBody;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1) return text.slice(first, last + 1);
  return text;
}

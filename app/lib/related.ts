import type { PaperMeta } from "@/app/lib/arxiv";

export type RelatedPaperStub = {
  id: string;
  title: string;
  authors: string[];
  absUrl: string;
  reason: string;
};

const SEED_RELATED: Record<string, RelatedPaperStub[]> = {
  "1706.03762": [
    {
      id: "2005.14165",
      title: "Language Models are Few-Shot Learners",
      authors: ["Brown et al."],
      absUrl: "https://arxiv.org/abs/2005.14165",
      reason:
        "GPT-3 — the scaling thesis that took Attention's transformer to its first product-market fit.",
    },
  ],
  "2212.08073": [
    {
      id: "2203.02155",
      title:
        "Training language models to follow instructions with human feedback",
      authors: ["Ouyang et al."],
      absUrl: "https://arxiv.org/abs/2203.02155",
      reason:
        "RLHF — the predecessor alignment technique that Constitutional AI replaces with AI feedback.",
    },
  ],
  "0905.0977": [
    {
      id: "1209.4491",
      title: "Peer Prediction with Heterogeneous Users",
      authors: ["Witkowski & Parkes"],
      absUrl: "https://arxiv.org/abs/1209.4491",
      reason:
        "Scoring-rule mechanism design for subjective markets — adjacent to biometric oracle settlement.",
    },
  ],
};

export function relatedPapers(paper: PaperMeta): RelatedPaperStub[] {
  const seeded = SEED_RELATED[paper.id];
  if (seeded && seeded.length) return seeded;

  const primaryCat = paper.categories[0] ?? "cs.LG";
  return [
    {
      id: "synthetic-1",
      title: `Adjacent work in ${primaryCat}`,
      authors: ["Unknown"],
      absUrl: paper.absUrl,
      reason: `Closest neighbor in ${primaryCat} by topical overlap. Pluggable — swap this stub with a vector search or Semantic Scholar call later.`,
    },
  ];
}

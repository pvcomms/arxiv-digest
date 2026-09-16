import type { PaperMeta } from "@/app/lib/arxiv";

export type BranchKind = "method" | "related" | "implications" | "root";

export type TreeNode = {
  id: string;
  kind: BranchKind;
  title: string;
  body: string;
  streaming?: boolean;
  children: string[];
  parentId: string | null;
  createdAt: number;
  meta?: {
    relatedTitle?: string;
    relatedUrl?: string;
    topic?: string;
  };
};

export type Tree = {
  paperId: string;
  paper: PaperMeta;
  rootId: string;
  nodes: Record<string, TreeNode>;
};

const KEY_PREFIX = "arxiv-digest:tree:";

export function treeKey(paperId: string): string {
  return `${KEY_PREFIX}${paperId}`;
}

export function loadTree(paperId: string): Tree | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(treeKey(paperId));
    if (!raw) return null;
    return JSON.parse(raw) as Tree;
  } catch {
    return null;
  }
}

export function saveTree(tree: Tree): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(treeKey(tree.paperId), JSON.stringify(tree));
  } catch {}
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function treeToMarkdown(tree: Tree): string {
  const lines: string[] = [];
  lines.push(`# ${tree.paper.title}`);
  lines.push("");
  lines.push(
    `${tree.paper.authors.join(", ")} · ${new Date(tree.paper.published).toISOString().slice(0, 10)} · ${tree.paper.absUrl}`,
  );
  lines.push("");

  const walk = (nodeId: string, depth: number) => {
    const node = tree.nodes[nodeId];
    if (!node) return;
    const indent = "  ".repeat(Math.max(0, depth - 1));
    if (depth === 0) {
      lines.push("## Root digest");
    } else {
      lines.push(`${indent}- **${node.title}** _(${node.kind})_`);
    }
    if (node.body.trim()) {
      const bodyLines = node.body.trim().split(/\n+/);
      for (const bl of bodyLines) {
        if (depth === 0) lines.push(bl);
        else lines.push(`${indent}  ${bl}`);
      }
    }
    lines.push("");
    for (const childId of node.children) walk(childId, depth + 1);
  };

  walk(tree.rootId, 0);
  return lines.join("\n");
}

export const BRANCH_LABEL: Record<Exclude<BranchKind, "root">, string> = {
  method: "Go deeper on method",
  related: "Compare to related paper",
  implications: "Implications for Param's stack",
};

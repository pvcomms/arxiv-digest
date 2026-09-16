"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { PaperMeta } from "@/app/lib/arxiv";
import {
  BRANCH_LABEL,
  loadTree,
  newId,
  saveTree,
  treeToMarkdown,
  type BranchKind,
  type Tree,
  type TreeNode,
} from "@/app/lib/tree";

type Digest = {
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

const MAX_UNDO = 10;

function parseDigest(text: string): Digest | null {
  const cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : cleaned;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1) return null;
  try {
    return JSON.parse(raw.slice(first, last + 1)) as Digest;
  } catch {
    return null;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [paper, setPaper] = useState<PaperMeta | null>(null);
  const [rootRaw, setRootRaw] = useState("");
  const [rootStreaming, setRootStreaming] = useState(false);
  const [tree, setTree] = useState<Tree | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [streamingNodeId, setStreamingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Tree[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // persist tree
  useEffect(() => {
    if (tree) saveTree(tree);
  }, [tree]);

  const pushHistory = useCallback((t: Tree | null) => {
    if (!t) return;
    setHistory((h) => [...h.slice(-(MAX_UNDO - 1)), t]);
  }, []);

  const updateTree = useCallback(
    (mutator: (prev: Tree) => Tree) => {
      setTree((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        return mutator(prev);
      });
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setTree(last);
      return h.slice(0, -1);
    });
  }, []);

  const resetPaper = useCallback(() => {
    abortRef.current?.abort();
    setPaper(null);
    setRootRaw("");
    setTree(null);
    setSelectedId(null);
    setStreamingNodeId(null);
    setError(null);
    setHistory([]);
    setUrl("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // --- start root digest ---
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || rootStreaming) return;
    setError(null);
    setRootRaw("");
    setTree(null);
    setHistory([]);
    setRootStreaming(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/digest/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `request failed (${res.status})`);
      }

      let gotPaper: PaperMeta | null = null;
      let acc = "";

      await consumeSSE(res.body, ac.signal, (event, data) => {
        if (event === "paper") {
          gotPaper = data as PaperMeta;
          setPaper(gotPaper);

          const existing = loadTree(gotPaper.id);
          if (existing) {
            setTree(existing);
            setSelectedId(existing.rootId);
          } else {
            const rootId = newId();
            const freshTree: Tree = {
              paperId: gotPaper.id,
              paper: gotPaper,
              rootId,
              nodes: {
                [rootId]: {
                  id: rootId,
                  kind: "root",
                  title: gotPaper.title,
                  body: "",
                  streaming: true,
                  children: [],
                  parentId: null,
                  createdAt: Date.now(),
                },
              },
            };
            setTree(freshTree);
            setSelectedId(rootId);
            setStreamingNodeId(rootId);
          }
        } else if (event === "token") {
          const t = (data as { t: string }).t;
          acc += t;
          setRootRaw(acc);
          setTree((prev) => {
            if (!prev) return prev;
            const rootNode = prev.nodes[prev.rootId];
            if (!rootNode) return prev;
            return {
              ...prev,
              nodes: {
                ...prev.nodes,
                [prev.rootId]: { ...rootNode, body: acc },
              },
            };
          });
        } else if (event === "done") {
          setTree((prev) => {
            if (!prev) return prev;
            const rootNode = prev.nodes[prev.rootId];
            return {
              ...prev,
              nodes: {
                ...prev.nodes,
                [prev.rootId]: { ...rootNode, streaming: false },
              },
            };
          });
        } else if (event === "error") {
          throw new Error((data as { error: string }).error);
        }
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // intentional stop — leave partial
      } else {
        setError(err instanceof Error ? err.message : "something broke");
      }
    } finally {
      setRootStreaming(false);
      setStreamingNodeId(null);
    }
  }

  // --- branch expansion ---
  async function expandBranch(parentId: string, kind: BranchKind) {
    if (!tree || !paper || streamingNodeId) return;
    if (kind === "root") return;

    const parent = tree.nodes[parentId];
    if (!parent) return;

    const nodeId = newId();
    const title = BRANCH_LABEL[kind as Exclude<BranchKind, "root">];

    updateTree((prev) => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [nodeId]: {
          id: nodeId,
          kind,
          title,
          body: "",
          streaming: true,
          children: [],
          parentId,
          createdAt: Date.now(),
        },
        [parentId]: {
          ...prev.nodes[parentId],
          children: [...prev.nodes[parentId].children, nodeId],
        },
      },
    }));
    setSelectedId(nodeId);
    setStreamingNodeId(nodeId);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          paper,
          parentContext: parent.body,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `branch failed (${res.status})`);
      }

      let acc = "";
      await consumeSSE(res.body, ac.signal, (event, data) => {
        if (event === "related") {
          const r = data as { title: string; absUrl: string };
          setTree((prev) => {
            if (!prev) return prev;
            const node = prev.nodes[nodeId];
            if (!node) return prev;
            return {
              ...prev,
              nodes: {
                ...prev.nodes,
                [nodeId]: {
                  ...node,
                  meta: {
                    ...(node.meta ?? {}),
                    relatedTitle: r.title,
                    relatedUrl: r.absUrl,
                  },
                },
              },
            };
          });
        } else if (event === "token") {
          const t = (data as { t: string }).t;
          acc += t;
          setTree((prev) => {
            if (!prev) return prev;
            const node = prev.nodes[nodeId];
            if (!node) return prev;
            return {
              ...prev,
              nodes: { ...prev.nodes, [nodeId]: { ...node, body: acc } },
            };
          });
        } else if (event === "done") {
          setTree((prev) => {
            if (!prev) return prev;
            const node = prev.nodes[nodeId];
            if (!node) return prev;
            return {
              ...prev,
              nodes: {
                ...prev.nodes,
                [nodeId]: { ...node, streaming: false },
              },
            };
          });
        } else if (event === "error") {
          throw new Error((data as { error: string }).error);
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "branch failed");
      }
    } finally {
      setStreamingNodeId(null);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRootStreaming(false);
    setStreamingNodeId(null);
    setTree((prev) => {
      if (!prev) return prev;
      const n: Record<string, TreeNode> = {};
      for (const [k, v] of Object.entries(prev.nodes))
        n[k] = v.streaming ? { ...v, streaming: false } : v;
      return { ...prev, nodes: n };
    });
  }

  function exportMarkdown() {
    if (!tree) return;
    const md = treeToMarkdown(tree);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tree.paperId.replace(/[/.]/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const selectedNode = tree && selectedId ? tree.nodes[selectedId] : null;
  const rootDigest =
    tree && !tree.nodes[tree.rootId].streaming
      ? parseDigest(tree.nodes[tree.rootId].body)
      : parseDigest(rootRaw);

  return (
    <div className="flex-1 w-full">
      <main className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        {!paper && (
          <header className="rise">
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
              arxiv digest
            </div>
            <h1 className="display mt-3 text-5xl sm:text-6xl leading-[0.95] text-[var(--ink)]">
              Paper in. <em className="italic">Stack-shaped</em>
              <br />
              take out.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-[1.65] text-[var(--ink-soft)]">
              Paste an arXiv URL. Read the first pass, then branch deeper — by
              method, by related paper, or by implication for your stack.
              Streams live. Tree persists per paper.
            </p>
          </header>
        )}

        {!paper && (
          <form
            onSubmit={submit}
            className="rise rise-1 mt-10 flex flex-col sm:flex-row gap-3 max-w-2xl"
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              placeholder="https://arxiv.org/abs/2501.12345"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={rootStreaming}
              className="flex-1 min-w-0 bg-[var(--bg-elev)] border border-[var(--line)] rounded-[10px] px-4 py-3 text-[15px] placeholder:text-[var(--ink-mute)] focus:border-[var(--ink)] transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={rootStreaming || !url.trim()}
              className="shrink-0 bg-[var(--ink)] text-[var(--bg)] rounded-[10px] px-6 py-3 text-[14px] font-medium tracking-tight hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {rootStreaming ? "Reading…" : "Digest"}
            </button>
          </form>
        )}

        {!paper && !rootStreaming && !error && (
          <div className="rise rise-2 mt-14 text-[12px] mono uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            <div className="mb-3">try</div>
            <div className="flex flex-col gap-1.5 normal-case tracking-normal text-[13px] font-sans">
              <ExampleLink
                onClick={setUrl}
                label="Attention Is All You Need"
                url="https://arxiv.org/abs/1706.03762"
              />
              <ExampleLink
                onClick={setUrl}
                label="Constitutional AI"
                url="https://arxiv.org/abs/2212.08073"
              />
              <ExampleLink
                onClick={setUrl}
                label="Prediction Markets in Theory and Practice"
                url="https://arxiv.org/abs/0905.0977"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rise mt-10 border-l-2 border-[var(--accent)] pl-4 py-1 max-w-2xl">
            <div className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
              error
            </div>
            <div className="mt-1 text-[14px] text-[var(--ink)]">{error}</div>
          </div>
        )}

        {paper && tree && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
            <aside className="lg:sticky lg:top-10 lg:self-start">
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)] mb-4">
                reading tree
              </div>
              <TreeSidebar
                tree={tree}
                selectedId={selectedId}
                streamingNodeId={streamingNodeId}
                onSelect={setSelectedId}
              />

              <div className="mt-8 pt-6 border-t border-[var(--line-soft)] flex flex-col gap-2">
                <SidebarButton
                  onClick={undo}
                  disabled={history.length === 0}
                  label="Undo"
                  meta={`${history.length}/${MAX_UNDO}`}
                />
                <SidebarButton onClick={exportMarkdown} label="Export .md" />
                <SidebarButton onClick={resetPaper} label="New paper" />
                {(rootStreaming || streamingNodeId) && (
                  <SidebarButton onClick={stop} label="Stop" accent />
                )}
              </div>
            </aside>

            <section>
              {selectedNode && (
                <NodeView
                  node={selectedNode}
                  paper={paper}
                  isRoot={selectedNode.id === tree.rootId}
                  rootDigest={
                    selectedNode.id === tree.rootId ? rootDigest : null
                  }
                  canBranch={!streamingNodeId}
                  onBranch={(kind) => expandBranch(selectedNode.id, kind)}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- SSE consumer ----------
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  handler: (event: string, data: unknown) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) {
      reader.cancel().catch(() => {});
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split(/\n\n/);
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        handler(event, JSON.parse(data));
      } catch {
        handler(event, data);
      }
    }
  }
}

// ---------- Sidebar tree ----------
function TreeSidebar({
  tree,
  selectedId,
  streamingNodeId,
  onSelect,
}: {
  tree: Tree;
  selectedId: string | null;
  streamingNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const render = (nodeId: string, depth: number) => {
    const node = tree.nodes[nodeId];
    if (!node) return null;
    const isSel = selectedId === nodeId;
    const isStreaming = streamingNodeId === nodeId;
    return (
      <div key={nodeId}>
        <button
          onClick={() => onSelect(nodeId)}
          className={`w-full text-left text-[13px] leading-[1.4] py-1.5 px-2 rounded-[6px] transition-colors ${
            isSel
              ? "bg-[var(--bg-elev)] text-[var(--ink)]"
              : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <span className="flex items-center gap-2">
            <span
              className={`mono text-[10px] uppercase tracking-[0.14em] ${
                isSel ? "text-[var(--accent)]" : "text-[var(--ink-mute)]"
              }`}
            >
              {node.kind === "root"
                ? "root"
                : node.kind === "method"
                  ? "method"
                  : node.kind === "related"
                    ? "related"
                    : "stack"}
            </span>
            <span className="truncate">
              {node.kind === "root"
                ? "Root digest"
                : BRANCH_LABEL[node.kind as Exclude<typeof node.kind, "root">]}
            </span>
            {isStreaming && (
              <span className="ml-auto inline-flex gap-0.5">
                <span className="pulse-dot w-1 h-1 rounded-full bg-[var(--ink-mute)]" />
                <span className="pulse-dot w-1 h-1 rounded-full bg-[var(--ink-mute)]" />
                <span className="pulse-dot w-1 h-1 rounded-full bg-[var(--ink-mute)]" />
              </span>
            )}
          </span>
        </button>
        {node.children.map((c) => render(c, depth + 1))}
      </div>
    );
  };
  return <div className="flex flex-col gap-0.5">{render(tree.rootId, 0)}</div>;
}

function SidebarButton({
  onClick,
  label,
  meta,
  disabled,
  accent,
}: {
  onClick: () => void;
  label: string;
  meta?: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between text-left text-[12px] mono uppercase tracking-[0.14em] py-2 px-2 rounded-[6px] transition-colors ${
        accent
          ? "text-[var(--accent)] hover:bg-[var(--accent-soft)]"
          : "text-[var(--ink-mute)] hover:text-[var(--ink)] hover:bg-[var(--bg-elev)]"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <span>{label}</span>
      {meta && <span className="text-[10px]">{meta}</span>}
    </button>
  );
}

// ---------- Node view ----------
function NodeView({
  node,
  paper,
  isRoot,
  rootDigest,
  canBranch,
  onBranch,
}: {
  node: TreeNode;
  paper: PaperMeta;
  isRoot: boolean;
  rootDigest: Digest | null;
  canBranch: boolean;
  onBranch: (kind: BranchKind) => void;
}) {
  return (
    <article className="rise">
      {isRoot ? (
        <RootView
          paper={paper}
          streaming={!!node.streaming}
          rawBody={node.body}
          digest={rootDigest}
        />
      ) : (
        <BranchView node={node} />
      )}

      {!node.streaming && (
        <div className="mt-12 pt-6 border-t border-[var(--line-soft)]">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)] mb-4">
            branch deeper
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <BranchButton
              onClick={() => onBranch("method")}
              disabled={!canBranch}
              label="Go deeper on method"
            />
            <BranchButton
              onClick={() => onBranch("related")}
              disabled={!canBranch}
              label="Compare to related paper"
            />
            <BranchButton
              onClick={() => onBranch("implications")}
              disabled={!canBranch}
              label="Implications for your stack"
            />
          </div>
        </div>
      )}
    </article>
  );
}

function BranchButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 text-left bg-[var(--bg-elev)] border border-[var(--line)] hover:border-[var(--ink)] rounded-[10px] px-4 py-3 text-[13px] leading-[1.4] text-[var(--ink)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
      <span className="block mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)] mt-1">
        stream →
      </span>
    </button>
  );
}

// ---------- Root rendering ----------
const VERDICT_LABEL: Record<Digest["verdict"], string> = {
  "must-read": "Must read",
  "worth-skimming": "Worth skimming",
  skip: "Skip",
};

const PROJECT_ORDER: Digest["connections"][number]["project"][] = [
  "Keep",
  "Param Hub",
  "TFR",
  "Both And",
  "Build Yourself",
  "Wired Different",
];

function RootView({
  paper,
  streaming,
  rawBody,
  digest,
}: {
  paper: PaperMeta;
  streaming: boolean;
  rawBody: string;
  digest: Digest | null;
}) {
  const sortedConnections = digest
    ? [...digest.connections].sort(
        (a, b) =>
          PROJECT_ORDER.indexOf(a.project) - PROJECT_ORDER.indexOf(b.project),
      )
    : [];

  return (
    <>
      {digest && <VerdictPill verdict={digest.verdict} />}

      <h2 className="rise rise-1 display mt-5 text-3xl sm:text-4xl leading-[1.1] text-[var(--ink)]">
        {paper.title}
      </h2>

      <div className="rise rise-1 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ink-mute)]">
        <span>{authorLine(paper.authors)}</span>
        <span className="text-[var(--line)]">·</span>
        <span>{formatDate(paper.published)}</span>
        <span className="text-[var(--line)]">·</span>
        <a
          href={paper.absUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)] hover:text-[var(--ink)] transition-colors"
        >
          arxiv
        </a>
        <a
          href={paper.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)] hover:text-[var(--ink)] transition-colors"
        >
          pdf
        </a>
      </div>

      {streaming && !digest && (
        <div className="mt-10">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)] mb-3">
            streaming
          </div>
          <pre className="whitespace-pre-wrap text-[13px] leading-[1.6] text-[var(--ink-soft)] font-mono">
            {rawBody}
            <Cursor />
          </pre>
        </div>
      )}

      {digest && (
        <>
          <Section label="TL;DR" delay={2}>
            <p className="text-[17px] leading-[1.6] text-[var(--ink)]">
              {digest.tldr}
            </p>
          </Section>

          <Section label="Why it matters" delay={3}>
            <p className="text-[15px] leading-[1.7] text-[var(--ink-soft)]">
              {digest.why_it_matters}
            </p>
          </Section>

          {sortedConnections.length > 0 && (
            <Section label="Connections" delay={4}>
              <dl className="divide-y divide-[var(--line-soft)] border-t border-b border-[var(--line-soft)]">
                {sortedConnections.map((c, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[auto_1fr] gap-x-6 py-4"
                  >
                    <dt className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)] pt-0.5 w-28">
                      {c.project}
                    </dt>
                    <dd className="text-[15px] leading-[1.65] text-[var(--ink-soft)]">
                      {c.angle}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {digest.steal.length > 0 && (
            <Section label="Steal" delay={4}>
              <ul className="space-y-3">
                {digest.steal.map((s, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[auto_1fr] gap-x-4 text-[15px] leading-[1.65] text-[var(--ink-soft)]"
                  >
                    <span className="mono text-[12px] text-[var(--ink-mute)] pt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section label="Skepticism" delay={4}>
            <p className="text-[15px] leading-[1.7] text-[var(--ink-soft)] border-l border-[var(--line)] pl-4">
              {digest.skepticism}
            </p>
          </Section>

          {digest.questions.length > 0 && (
            <Section label="Open questions" delay={4}>
              <ul className="space-y-3">
                {digest.questions.map((q, i) => (
                  <li
                    key={i}
                    className="text-[15px] leading-[1.65] text-[var(--ink-soft)] display italic"
                  >
                    — {q}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="mt-10 text-[11px] mono uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {paper.categories.slice(0, 3).join(" / ")}
          </div>
        </>
      )}
    </>
  );
}

function BranchView({ node }: { node: TreeNode }) {
  return (
    <>
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
        {node.kind} branch
      </div>
      <h2 className="display mt-3 text-3xl leading-[1.15] text-[var(--ink)]">
        {node.title}
      </h2>
      {node.meta?.relatedTitle && (
        <div className="mt-3 text-[13px] text-[var(--ink-mute)]">
          vs.{" "}
          <a
            href={node.meta.relatedUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)] hover:text-[var(--ink)] transition-colors"
          >
            {node.meta.relatedTitle}
          </a>
        </div>
      )}
      <div className="mt-8 text-[15px] leading-[1.75] text-[var(--ink-soft)] whitespace-pre-wrap">
        {node.body}
        {node.streaming && <Cursor />}
      </div>
    </>
  );
}

function Cursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-[var(--ink)] animate-pulse"
    />
  );
}

function Section({
  label,
  delay,
  children,
}: {
  label: string;
  delay: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <section className={`rise rise-${delay} mt-10`}>
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-mute)] mb-3">
        {label}
      </div>
      {children}
    </section>
  );
}

function VerdictPill({ verdict }: { verdict: Digest["verdict"] }) {
  const styles: Record<Digest["verdict"], string> = {
    "must-read": "bg-[var(--ink)] text-[var(--bg)]",
    "worth-skimming":
      "bg-[var(--accent-soft)] text-[var(--ink)] border border-[var(--accent-soft)]",
    skip: "bg-transparent text-[var(--ink-mute)] border border-[var(--line)]",
  };
  return (
    <div className="rise">
      <span
        className={`mono text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-full ${styles[verdict]}`}
      >
        {VERDICT_LABEL[verdict]}
      </span>
    </div>
  );
}

function ExampleLink({
  label,
  url,
  onClick,
}: {
  label: string;
  url: string;
  onClick: (url: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(url)}
      className="text-left text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors group"
    >
      <span className="underline decoration-[var(--line)] underline-offset-4 group-hover:decoration-[var(--ink)]">
        {label}
      </span>
      <span className="mono text-[11px] text-[var(--ink-mute)] ml-2">
        {url.replace("https://arxiv.org/abs/", "")}
      </span>
    </button>
  );
}

function authorLine(authors: string[]): string {
  if (authors.length === 0) return "";
  if (authors.length <= 2) return authors.join(", ");
  return `${authors[0]} et al.`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

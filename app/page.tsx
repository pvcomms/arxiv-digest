"use client";

import { useState, useRef, useEffect } from "react";
import type { PaperMeta } from "@/app/lib/arxiv";

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

type Result = { paper: PaperMeta; digest: Digest };

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

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something broke");
    } finally {
      setLoading(false);
    }
  }

  const sortedConnections = result
    ? [...result.digest.connections].sort(
        (a, b) =>
          PROJECT_ORDER.indexOf(a.project) - PROJECT_ORDER.indexOf(b.project),
      )
    : [];

  return (
    <div className="flex-1 w-full">
      <main className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
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
            Paste an arXiv URL. Get a terse, opinionated digest grounded in your
            own projects — Keep, Param Hub, TFR, Both And, Build Yourself, Wired
            Different.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="rise rise-1 mt-10 flex flex-col sm:flex-row gap-3"
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            placeholder="https://arxiv.org/abs/2501.12345"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            className="flex-1 min-w-0 bg-[var(--bg-elev)] border border-[var(--line)] rounded-[10px] px-4 py-3 text-[15px] placeholder:text-[var(--ink-mute)] focus:border-[var(--ink)] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="shrink-0 bg-[var(--ink)] text-[var(--bg)] rounded-[10px] px-6 py-3 text-[14px] font-medium tracking-tight hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? "Reading…" : "Digest"}
          </button>
        </form>

        {loading && (
          <div className="rise mt-12 flex items-center gap-3 text-[var(--ink-mute)] text-[13px]">
            <span className="inline-flex gap-1">
              <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[var(--ink-mute)]" />
              <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[var(--ink-mute)]" />
              <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[var(--ink-mute)]" />
            </span>
            <span className="mono uppercase tracking-[0.14em] text-[11px]">
              fetching + thinking
            </span>
          </div>
        )}

        {error && (
          <div className="rise mt-10 border-l-2 border-[var(--accent)] pl-4 py-1">
            <div className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
              error
            </div>
            <div className="mt-1 text-[14px] text-[var(--ink)]">{error}</div>
          </div>
        )}

        {result && (
          <article className="mt-14">
            <VerdictPill verdict={result.digest.verdict} />

            <h2 className="rise rise-1 display mt-5 text-3xl sm:text-4xl leading-[1.1] text-[var(--ink)]">
              {result.paper.title}
            </h2>

            <div className="rise rise-1 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ink-mute)]">
              <span>{authorLine(result.paper.authors)}</span>
              <span className="text-[var(--line)]">·</span>
              <span>{formatDate(result.paper.published)}</span>
              <span className="text-[var(--line)]">·</span>
              <a
                href={result.paper.absUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)] hover:text-[var(--ink)] transition-colors"
              >
                arxiv
              </a>
              <a
                href={result.paper.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)] hover:text-[var(--ink)] transition-colors"
              >
                pdf
              </a>
            </div>

            <Section label="TL;DR" delay={2}>
              <p className="text-[17px] leading-[1.6] text-[var(--ink)]">
                {result.digest.tldr}
              </p>
            </Section>

            <Section label="Why it matters" delay={3}>
              <p className="text-[15px] leading-[1.7] text-[var(--ink-soft)]">
                {result.digest.why_it_matters}
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

            {result.digest.steal.length > 0 && (
              <Section label="Steal" delay={4}>
                <ul className="space-y-3">
                  {result.digest.steal.map((s, i) => (
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
                {result.digest.skepticism}
              </p>
            </Section>

            {result.digest.questions.length > 0 && (
              <Section label="Open questions" delay={4}>
                <ul className="space-y-3">
                  {result.digest.questions.map((q, i) => (
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

            <div className="mt-16 pt-6 border-t border-[var(--line-soft)] flex items-center justify-between text-[11px] mono uppercase tracking-[0.14em] text-[var(--ink-mute)]">
              <span>{result.paper.categories.slice(0, 3).join(" / ")}</span>
              <button
                onClick={() => {
                  setResult(null);
                  setUrl("");
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="hover:text-[var(--ink)] transition-colors"
              >
                new paper →
              </button>
            </div>
          </article>
        )}

        {!result && !loading && !error && (
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
      </main>
    </div>
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

# arxiv-digest

Paste an arXiv URL. Get a stack-shaped digest grounded in a fixed set of projects.

**Live:** [arxiv-digest-hazel.vercel.app](https://arxiv-digest-hazel.vercel.app)

## What it does

Most paper summarizers give you a generic TL;DR. This one is tuned for a single reader and asks a sharper question: _does this paper change what I ship?_

**Input:** an arXiv abs/pdf URL.

**Output:** a typed JSON digest with

- `verdict` — `must-read` | `worth-skimming` | `skip`
- `tldr` — 2 sentences, no hedging
- `why_it_matters` — placement in the landscape
- `connections` — concrete hooks into Keep, Param Hub, TFR, Both And, Build Yourself, Wired Different
- `steal` — algorithm / UI / framing to lift
- `skepticism` — the honest counter
- `questions` — 2–3 open questions

## Stack

- Next.js 15 (App Router) on Vercel
- Claude Opus 4.7 via `@anthropic-ai/sdk`
- Ephemeral prompt caching on the stack-context system prompt (cache hit drops cost per digest by ~90% after the first call)
- arXiv metadata via the abs-page XML feed

## Cost

Opus 4.7 at ~2k output tokens per digest. With cached system prompt:

- First call in a 5-min window: ~$0.03
- Subsequent calls: ~$0.003

## Why

I read 5–15 arXiv papers a week. The 20% that touch what I'm actually building get buried under the 80% that don't. A digest that is explicitly project-aware turns the reading queue from "interesting ideas" into "decisions I need to make."

## Run locally

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
pnpm dev
```

Paste any arxiv.org/abs/... URL into the input.

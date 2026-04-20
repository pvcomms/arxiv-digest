import Anthropic from "@anthropic-ai/sdk";

export type SSEController = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

export function makeSSEStream(): {
  stream: ReadableStream<Uint8Array>;
  controller: SSEController;
} {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      streamController = c;
    },
  });

  const send = (event: string, data: unknown) => {
    if (!streamController) return;
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    streamController.enqueue(
      encoder.encode(`event: ${event}\ndata: ${payload}\n\n`),
    );
  };

  const close = () => {
    try {
      streamController?.close();
    } catch {}
  };

  return { stream, controller: { send, close } };
}

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function streamAnthropic(
  opts: {
    system: Array<Anthropic.TextBlockParam>;
    userBlock: string;
    maxTokens?: number;
  },
  controller: SSEController,
  signal: AbortSignal,
): Promise<string> {
  const anthropic = new Anthropic();
  let full = "";
  const stream = anthropic.messages.stream(
    {
      model: "claude-opus-4-7",
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: "user", content: opts.userBlock }],
    },
    { signal },
  );

  for await (const event of stream) {
    if (signal.aborted) break;
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const t = event.delta.text;
      full += t;
      controller.send("token", { t });
    }
  }
  return full;
}

const STUB_SENTENCES = [
  "Stub generator active — no ANTHROPIC_API_KEY detected in the environment.",
  "This path exists so the demo still feels alive when the key is missing.",
  "Tokens are emitted on a gentle cadence, mimicking the real streaming surface.",
  "When you wire a real key into .env.local, this fallback disappears and Opus takes over.",
  "The reading-depth tree, undo stack, and markdown export all run identically against either source.",
];

export async function streamStub(
  prompt: string,
  controller: SSEController,
  signal: AbortSignal,
): Promise<string> {
  const seed = (prompt.length + Date.now()) % STUB_SENTENCES.length;
  const body = [
    STUB_SENTENCES[seed],
    ...STUB_SENTENCES.filter((_, i) => i !== seed).slice(0, 3),
  ].join(" ");

  let full = "";
  const tokens = body.split(/(\s+)/);
  for (const t of tokens) {
    if (signal.aborted) break;
    full += t;
    controller.send("token", { t });
    await new Promise((r) => setTimeout(r, 35));
  }
  return full;
}

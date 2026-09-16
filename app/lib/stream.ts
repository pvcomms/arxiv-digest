import { GoogleGenAI } from "@google/genai";

export type SSEController = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

export type SystemBlock = { type: "text"; text: string };

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

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;
}

export async function streamGemini(
  opts: {
    system: Array<SystemBlock>;
    userBlock: string;
    maxTokens?: number;
  },
  controller: SSEController,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const systemText = opts.system.map((b) => b.text).join("\n\n");

  let full = "";
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: opts.userBlock }] }],
    config: {
      systemInstruction: systemText,
      maxOutputTokens: opts.maxTokens ?? 4000,
    },
  });

  for await (const chunk of response) {
    if (signal.aborted) break;
    const t = chunk.text;
    if (t) {
      full += t;
      controller.send("token", { t });
    }
  }
  return full;
}

const STUB_SENTENCES = [
  "Stub generator active — no GEMINI_API_KEY detected in the environment.",
  "This path exists so the demo still feels alive when the key is missing.",
  "Tokens are emitted on a gentle cadence, mimicking the real streaming surface.",
  "When you wire a real key into .env.local, this fallback disappears and Gemini takes over.",
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

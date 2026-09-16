import { XMLParser } from "fast-xml-parser";

export type PaperMeta = {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
};

const ARXIV_ID_RE =
  /arxiv\.org\/(?:abs|pdf|html)\/([0-9]{4}\.[0-9]{4,5}|[a-z\-]+\/[0-9]{7})/i;

export function parseArxivId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(ARXIV_ID_RE);
  if (m) return m[1].replace(/\.pdf$/i, "");
  if (/^[0-9]{4}\.[0-9]{4,5}(v[0-9]+)?$/.test(trimmed)) return trimmed;
  return null;
}

export async function fetchArxivPaper(id: string): Promise<PaperMeta> {
  const cleanId = id.replace(/v[0-9]+$/, "");
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "arxiv-digest/1.0 (param@cyborgmarket.com)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`arxiv fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["author", "category", "link"].includes(name),
  });
  const parsed = parser.parse(xml);
  const entry = parsed?.feed?.entry;
  if (!entry) throw new Error("paper not found on arxiv");

  const authors: string[] = (entry.author ?? []).map(
    (a: { name: string }) => a.name,
  );
  const categories: string[] = (entry.category ?? []).map(
    (c: { "@_term": string }) => c["@_term"],
  );
  const links = entry.link ?? [];
  const pdfLink = links.find(
    (l: { "@_title"?: string; "@_href": string }) => l["@_title"] === "pdf",
  );
  const absLink = links.find(
    (l: { "@_rel"?: string; "@_href": string }) => l["@_rel"] === "alternate",
  );

  return {
    id: cleanId,
    title: String(entry.title ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    authors,
    abstract: String(entry.summary ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    published: String(entry.published ?? ""),
    categories,
    pdfUrl: pdfLink?.["@_href"] ?? `https://arxiv.org/pdf/${cleanId}`,
    absUrl: absLink?.["@_href"] ?? `https://arxiv.org/abs/${cleanId}`,
  };
}

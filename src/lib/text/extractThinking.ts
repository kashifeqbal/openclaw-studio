const THINKING_BLOCK_RE =
  /<\s*(think(?:ing)?|analysis)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
const TRACE_MARKDOWN_PREFIX = "[[trace]]";

const extractRawText = (message: unknown): string | null => {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") return item.text;
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof m.text === "string") return m.text;
  return null;
};

export const extractThinking = (message: unknown): string | null => {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;
  const content = m.content;
  const parts: string[] = [];
  const extractFromRecord = (record: Record<string, unknown>): string | null => {
    const directKeys = ["thinking", "analysis", "reasoning"];
    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === "string") {
        const cleaned = value.trim();
        if (cleaned) return cleaned;
      }
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        const nestedKeys = ["text", "content", "summary", "analysis", "reasoning", "thinking"];
        for (const nestedKey of nestedKeys) {
          const nestedValue = nested[nestedKey];
          if (typeof nestedValue === "string") {
            const cleaned = nestedValue.trim();
            if (cleaned) return cleaned;
          }
        }
      }
    }
    return null;
  };

  if (Array.isArray(content)) {
    for (const p of content) {
      const item = p as Record<string, unknown>;
      const type = typeof item.type === "string" ? item.type : "";
      if (type === "thinking" || type === "analysis" || type === "reasoning") {
        const extracted = extractFromRecord(item);
        if (extracted) {
          parts.push(extracted);
        } else if (typeof item.text === "string") {
          const cleaned = item.text.trim();
          if (cleaned) parts.push(cleaned);
        }
      } else if (typeof item.thinking === "string") {
        const cleaned = item.thinking.trim();
        if (cleaned) parts.push(cleaned);
      }
    }
  }
  if (parts.length > 0) return parts.join("\n");

  const direct = extractFromRecord(m);
  if (direct) return direct;

  const rawText = extractRawText(message);
  if (!rawText) return null;
  const matches = [...rawText.matchAll(THINKING_BLOCK_RE)];
  const extracted = matches
    .map((match) => (match[2] ?? "").trim())
    .filter(Boolean);
  return extracted.length > 0 ? extracted.join("\n") : null;
};

export const formatThinkingMarkdown = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `_${line}_`);
  if (lines.length === 0) return "";
  return `${TRACE_MARKDOWN_PREFIX}\n${lines.join("\n")}`;
};

export const isTraceMarkdown = (line: string): boolean =>
  line.startsWith(TRACE_MARKDOWN_PREFIX);

export const stripTraceMarkdown = (line: string): string => {
  if (!isTraceMarkdown(line)) return line;
  return line.slice(TRACE_MARKDOWN_PREFIX.length).trimStart();
};

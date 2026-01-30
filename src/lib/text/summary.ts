const SUMMARY_MARKER_RE = /summary\s*[:\-]\s*/gi;

const splitLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const extractSummaryText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  let lastIndex = -1;
  let lastLength = 0;
  for (const match of trimmed.matchAll(SUMMARY_MARKER_RE)) {
    if (typeof match.index === "number") {
      lastIndex = match.index;
      lastLength = match[0].length;
    }
  }
  if (lastIndex >= 0) {
    const after = trimmed.slice(lastIndex + lastLength).trim();
    const afterLines = splitLines(after);
    if (afterLines.length > 0) return afterLines[0];
  }
  const lines = splitLines(trimmed);
  return lines.length > 0 ? lines[lines.length - 1] : trimmed;
};

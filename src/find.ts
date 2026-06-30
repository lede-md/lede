// case-insensitive; returns the start offset of each non-overlapping match;
// empty/whitespace-only query => []
export function findMatches(text: string, query: string): number[] {
  if (!query || query.trim().length === 0) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const results: number[] = [];
  let i = 0;
  while (i <= lowerText.length - lowerQuery.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
    if (idx === -1) break;
    results.push(idx);
    i = idx + lowerQuery.length;
  }
  return results;
}

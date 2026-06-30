export function countText(text: string): { words: number; chars: number } {
  const words = (text.match(/\S+/g) || []).length;
  return { words, chars: text.length };
}

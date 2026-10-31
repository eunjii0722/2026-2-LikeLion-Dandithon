// 긴 단어부터 매칭, 정규식 특수문자를 이스케이프해 본문을 안전하게 나눔.
export function splitDialectText(text, dialectWords = []) {
  const words = new Map(dialectWords.filter((item) => item
    && typeof item.word === "string" && item.word.length > 0).map((item) => [item.word, item]));
  if (!words.size) return [{ text, word: null }];
  const pattern = [...words.keys()].sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return text.split(new RegExp(`(${pattern})`, "gu"))
    .filter(Boolean).map((part) => ({ text: part, word: words.get(part) ?? null }));
}

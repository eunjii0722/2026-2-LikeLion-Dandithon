import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { isDiary } from "../lib/data.js";
import { DIARY_DIALECT_WORDS } from "../lib/prompts/diary.js";
import { hasOrchardScope, claimsFarmerConfirmation } from "../lib/diary-narrative.js";

export const sourceHash = (diary) => createHash("sha256").update(JSON.stringify(diary)).digest("hex");

// Publication-only transformation: never mutate the captured API responses.
export function publishDemoDiaries(records, overrides) {
  const ids = new Set(records.map((record) => `tree-1-w${record.week}`));
  assert.ok(Object.keys(overrides).every((id) => ids.has(id)), "Unknown editorial diary ID");
  return records.map((record) => {
    const original = record.diaryAttempts.find((attempt) => attempt.status === 200 && isDiary(attempt.response))?.response;
    assert.ok(original, "Missing successful source diary");
    const diary = structuredClone(original);
    diary.photo.url = record.photo.url;
    const edit = overrides[diary.id];
    if (!edit) return diary;
    assert.deepEqual(Object.keys(edit).filter((key) => key !== "displayStage").sort(), ["sourceSha256", "title", "text", "dialectWords"].sort(), "Only editorial fields are allowed");
    assert.equal(edit.sourceSha256, sourceHash(original), "Editorial source changed; review before publishing");
    for (const field of ["title", "text", "dialectWords"]) diary[field] = structuredClone(edit[field]);
    // A reviewed display label sits beside evidence.growthStage; the model's own result is never replaced.
    if (Object.hasOwn(edit, "displayStage")) diary.displayStage = edit.displayStage;
    assert.ok(isDiary(diary), "Invalid publication diary");
    const sentences = [...new Intl.Segmenter("ko", { granularity: "sentence" }).segment(diary.text)].filter(({ segment }) => segment.trim());
    assert.ok(sentences.length >= 4 && sentences.length <= 6, "Publication must have 4–6 sentences");
    assert.ok(diary.photo.type !== "orchard" || hasOrchardScope(diary.text), "Orchard scope missing");
    assert.ok(diary.evidence.farmerConfirmed || !claimsFarmerConfirmation(diary.text), "Unconfirmed farmer claim");
    assert.equal(new Set(diary.dialectWords.map((entry) => entry.word)).size, diary.dialectWords.length);
    assert.ok(diary.dialectWords.every(({ word, meaning }) => Object.hasOwn(DIARY_DIALECT_WORDS, word)
      && DIARY_DIALECT_WORDS[word] === meaning && diary.text.includes(word)), "Invalid publication glossary");
    return diary;
  });
}

export function demoSavedWords(diaries) {
  const savedWords = [];
  for (const diary of diaries) {
    const word = diary.dialectWords.find((entry) => !savedWords.some((saved) => saved.word === entry.word && saved.meaning === entry.meaning));
    if (word) savedWords.push({ ...word, week: diary.week });
  }
  return savedWords;
}

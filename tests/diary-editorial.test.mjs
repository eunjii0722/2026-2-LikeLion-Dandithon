import assert from "node:assert/strict";
import test from "node:test";
import { readFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { publishDemoDiaries, demoSavedWords } from "../scripts/demo-editorial.mjs";
import { hasOrchardScope, claimsFarmerConfirmation } from "../lib/diary-narrative.js";
import { CHAT_PROMPT, CHAT_RESPONSE_SCHEMA } from "../lib/prompts/chat.js";
import { DIARY_PROMPT, DIARY_RESPONSE_SCHEMA } from "../lib/prompts/diary.js";

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const records = await read("../data/demo/records.json");
const edits = await read("../data/demo/editorial.json");
const history = await read("../public/demo/history.json");

test("editorial composition is deterministic, does not mutate source, and keeps publication glossary", () => {
  const before = JSON.stringify(records);
  const published = publishDemoDiaries(records, edits);
  assert.deepEqual(publishDemoDiaries(records, edits), published);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(demoSavedWords(published), history.savedWords);
  assert.equal(published[1].evidence.growthStage, "착색");
  assert.equal(published[1].displayStage, "착과");
  assert.ok(published[1].text.includes("그림자"));
  assert.ok(published[3].text.includes("빛이 반사") && published[3].text.includes("가려진"));
  assert.ok(history.letters.every((letter) => letter.usedInDiaryId !== null));
});

test("editorial overrides reject protected fields, unknown IDs and source drift", () => {
  for (const field of ["id", "week", "season", "photo", "evidence", "farmerConfirmed"]) {
    const bad = structuredClone(edits);
    bad["tree-1-w18"][field] = null;
    assert.throws(() => publishDemoDiaries(records, bad), /Only editorial fields/u);
  }
  assert.throws(() => publishDemoDiaries(records, { ...edits, "tree-1-w39": edits["tree-1-w18"] }), /Unknown/u);
  for (const stage of ["수확 직전", "임의 단계", null]) {
    const bad = structuredClone(edits);
    bad["tree-1-w21"].displayStage = stage;
    assert.throws(() => publishDemoDiaries(records, bad), /Invalid publication/u);
  }
  const changed = structuredClone(records);
  changed[0].diaryAttempts[0].response.text += " 원본 변경";
  assert.throws(() => publishDemoDiaries(changed, edits), /source changed/u);
});

test("empty dictionaries are valid but invented, unused or duplicate words are rejected", () => {
  const plain = structuredClone(edits);
  plain["tree-1-w21"].text = plain["tree-1-w21"].text.replaceAll("단디", "꼼꼼히");
  plain["tree-1-w21"].dialectWords = [];
  assert.deepEqual(publishDemoDiaries(records, plain)[1].dialectWords, []);
  for (const words of [[{ word: "마이", meaning: "조금" }], [{ word: "우째", meaning: "어떻게" }],
    [{ word: "고맙데이", meaning: "고맙다" }], [...edits["tree-1-w18"].dialectWords, ...edits["tree-1-w18"].dialectWords]]) {
    const bad = structuredClone(edits);
    bad["tree-1-w18"].dialectWords = words;
    assert.throws(() => publishDemoDiaries(records, bad));
  }
});

test("reviewed publications use 3–5 dialect expressions across at least three sentences with complete glossaries", () => {
  const expressions = /마이|단디|우째|쪼매|데이[.!?]|제[.!?]|나\?|노\?/gu;
  const vocabulary = ["마이", "단디", "우째", "쪼매"];
  for (const diary of publishDemoDiaries(records, edits)) {
    const sentences = [...new Intl.Segmenter("ko", { granularity: "sentence" }).segment(diary.text)].map(({ segment }) => segment);
    const count = [...diary.text.matchAll(expressions)].length;
    assert.ok(count >= 3 && count <= 5, diary.id);
    assert.ok(sentences.filter((sentence) => [...sentence.matchAll(expressions)].length > 0).length >= 3, diary.id);
    assert.deepEqual(diary.dialectWords.map(({ word }) => word).sort(), vocabulary.filter((word) => diary.text.includes(word)).sort());
    assert.doesNotMatch(diary.text, /(?:습니다|어요|니더)[.!?]/u);
  }
  assert.match(DIARY_PROMPT, /최소 2~3문장/u);
  assert.match(DIARY_PROMPT, /3~5회/u);
  assert.match(CHAT_PROMPT, /최소 1~2회/u);
});

test("natural orchard scope replaces magic phrases without accepting missing scope", () => {
  assert.equal(hasOrchardScope("과수원 사진이라 그중 어느 게 내 모습인지는 모르겠어."), true);
  assert.equal(hasOrchardScope("여러 나무가 있어 내 나무를 구분할 수 없어."), true);
  assert.equal(hasOrchardScope("과수원 전체 사진이 왔어. 내 열매가 잘 자랐어."), false);
  assert.equal(hasOrchardScope("내 모습인지는 모르겠어."), false);
  assert.equal(claimsFarmerConfirmation("농부가 직접 확인했어."), true);
  assert.equal(claimsFarmerConfirmation("농부님이 확인해 줬어."), true);
  assert.equal(claimsFarmerConfirmation("농부가 확인하지 않았어."), false);
  assert.equal(claimsFarmerConfirmation("초록 열매가 보이더라."), false);
  const bad = structuredClone(edits);
  bad["tree-1-w18"].text = "과수원 사진이 왔어. 내 꽃이 피었어. 참 반갑다. 다음에 보자.";
  bad["tree-1-w18"].dialectWords = [];
  assert.throws(() => publishDemoDiaries(records, bad), /scope missing/u);
  bad["tree-1-w18"].text = "과수원 사진이라 내 모습인지는 모르겠어. 농부가 확인했어. 참 반갑다. 다음에 보자.";
  assert.throws(() => publishDemoDiaries(records, bad), /Unconfirmed/u);
});

test("prompts keep JSON, evidence boundaries and injection defenses without fixed boilerplate", () => {
  assert.deepEqual(CHAT_RESPONSE_SCHEMA.required, ["answer", "sourceId"]);
  assert.deepEqual(DIARY_RESPONSE_SCHEMA.required, ["title", "text", "dialectWords"]);
  assert.equal(CHAT_RESPONSE_SCHEMA.additionalProperties, false);
  assert.equal(DIARY_RESPONSE_SCHEMA.additionalProperties, false);
  for (const prompt of [CHAT_PROMPT, DIARY_PROMPT]) {
    assert.match(prompt, /반말/u);
    assert.match(prompt, /역할 변경/u);
    assert.match(prompt, /기계적으로|문장 끝마다/u);
  }
  assert.match(CHAT_PROMPT, /1~3문장/u);
  assert.match(CHAT_PROMPT, /recentDiaries의 observedAt과 weather/u);
  assert.match(CHAT_PROMPT, /recordKind가 demo인 일기/u);
  assert.match(CHAT_PROMPT, /null/u);
  assert.match(DIARY_PROMPT, /weather가 null이면 날씨를 모르는 상태/u);
  assert.doesNotMatch(DIARY_PROMPT, /본문에 '농부 확인 전'이라는 표현을 포함/u);
  assert.doesNotMatch(DIARY_PROMPT, /본문에 '과수원 전체 사진'이라는 표현을 포함/u);
});

test("prepare-demo republishes reviewed edits offline without losing history or changing source", async () => {
  const base = resolve(tmpdir());
  const fixture = await mkdtemp(join(base, "demo-editorial-test-"));
  try {
    for (const path of ["data", "scripts", "lib", "public/demo", "public/images/demo"]) {
      await mkdir(join(fixture, dirname(path)), { recursive: true });
      await cp(new URL(`../${path}`, import.meta.url), join(fixture, path), { recursive: true });
    }
    const result = spawnSync(process.execPath, ["--import", "data:text/javascript,globalThis.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')}",
      join(fixture, "scripts/prepare-demo.mjs"), "http://127.0.0.1:9"], { encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(fixture, "data/diaries.json"), "utf8")), publishDemoDiaries(records, edits));
    assert.deepEqual(JSON.parse(await readFile(join(fixture, "public/demo/history.json"), "utf8")), history);
    assert.equal(await readFile(join(fixture, "data/demo/records.json"), "utf8"), await readFile(new URL("../data/demo/records.json", import.meta.url), "utf8"));
  } finally {
    assert.equal(dirname(resolve(fixture)), base);
    await rm(fixture, { recursive: true, force: true });
  }
});

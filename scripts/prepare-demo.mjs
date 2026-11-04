// Explicit, resumable preparation. Uses existing local APIs; never reads or logs keys/Base64.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { isDiary } from "../lib/data.js";
import { publishDemoDiaries, demoSavedWords } from "./demo-editorial.mjs";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const write = (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const plan = await read("data/demo/plan.json");
const overrides = await read("data/demo/editorial.json");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3020");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Only local servers are allowed");
let records;
try { records = await read("data/demo/records.json"); }
catch (error) { if (error.code !== "ENOENT") throw error; records = []; }
const letters = structuredClone(plan.letters);

async function call(path, payload) {
  const calledAt = new Date().toISOString();
  try {
    const response = await fetch(new URL(path, base), {
      ...(payload && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(60_000),
    });
    return { calledAt, status: response.status, response: await response.json() };
  } catch {
    return { calledAt, status: null, response: { error: "Local API request failed or timed out" } };
  }
}

for (const entry of plan.entries) {
  const bytes = await readFile(new URL(`public/images/demo/${entry.photo}`, root));
  assert.ok(bytes.length <= 4 * 1024 * 1024);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let record = records.find((item) => item.week === entry.week);
  if (record) {
    assert.equal(record.photo.sha256, sha256, "Photo changed; review recorded results before preparing again");
  } else {
    record = { treeId: plan.treeId, week: entry.week, observedAt: entry.observedAt,
      expectedStage: entry.expectedStage, model: plan.model,
      photo: { url: `/images/demo/${entry.photo}`, sha256, bytes: bytes.length, mimeType: "image/jpeg", scope: entry.photoType },
      visionAttempts: [], weatherAttempts: [], diaryAttempts: [] };
    records.push(record);
  }
  if (!record.visionAttempts.some((attempt) => attempt.status === 200)) {
    record.visionAttempts.push(await call("/api/vision", { imageBase64: bytes.toString("base64"), mimeType: "image/jpeg" }));
    await write("data/demo/records.json", records);
  }
  if (record.weatherAttempts.length === 0) {
    record.weatherAttempts.push(await call(`/api/weather?date=${entry.observedAt}&treeId=${plan.treeId}`));
    await write("data/demo/records.json", records);
  }
  const vision = record.visionAttempts.find((attempt) => attempt.status === 200)?.response;
  const weatherCall = record.weatherAttempts.at(-1);
  const weather = weatherCall.status === 200 ? weatherCall.response.weather ?? null : null;
  console.log(JSON.stringify({ week: entry.week, stage: vision?.growth_stage ?? null,
    expectedStage: entry.expectedStage, weatherStatus: weatherCall.status,
    weather, weatherReason: weatherCall.response.reason ?? null }));
  if (!vision) { process.exitCode = 1; break; }
  const included = letters.filter((letter) => letter.treeId === plan.treeId && letter.usedInDiaryId === null && letter.week <= entry.week);
  const request = { treeId: plan.treeId, week: entry.week, photoType: entry.photoType, vision, weather,
    farmerNote: entry.farmerNote, farmerConfirmed: entry.farmerConfirmed, observedAt: entry.observedAt,
    letters: included.map((letter) => letter.text) };
  if (record.diaryRequest) assert.deepEqual(record.diaryRequest, request, "Input changed; review provenance before preparing again");
  record.diaryRequest = request;
  record.letterIds = included.map((letter) => letter.id);
  if (!record.diaryAttempts.some((attempt) => attempt.status === 200 && isDiary(attempt.response))) {
    record.diaryAttempts.push(await call("/api/diary", request));
    await write("data/demo/records.json", records);
  }
  const diary = record.diaryAttempts.find((attempt) => attempt.status === 200 && isDiary(attempt.response))?.response;
  console.log(JSON.stringify({ week: entry.week, diaryStatus: record.diaryAttempts.at(-1).status, ready: Boolean(diary) }));
  if (!diary) { process.exitCode = 1; break; }
  for (const letter of included) letter.usedInDiaryId = diary.id;
}

// Publish only a complete set. A failed call never becomes a fabricated diary.
const diaries = records.map((record) => {
  const result = record.diaryAttempts.find((attempt) => attempt.status === 200 && isDiary(attempt.response))?.response;
  return result && { ...result, photo: { ...result.photo, url: record.photo.url } };
});
if (process.exitCode || diaries.length !== 4 || diaries.some((diary) => !isDiary(diary))) {
  console.log("Preparation incomplete. API attempts preserved; application data was not replaced.");
  process.exitCode = 1;
} else {
  assert.deepEqual(diaries.map((diary) => diary.week), [18, 21, 28, 35]);
  const published = publishDemoDiaries(records, overrides);
  const savedWords = demoSavedWords(published);
  await write("data/diaries.json", published);
  await write("public/demo/history.json", { selectedTreeId: plan.treeId, letters, generatedDiaries: published, savedWords, chatHistory: [], "dandithon.demoState": { version: 1, treeId: plan.treeId, currentWeek: 39, asOf: "2026-09-26T09:00:00+09:00" }, "dandithon.adoption": { treeId: plan.treeId, adoptedAt: "2026-04-04T09:00:00+09:00" } });
  console.log(`Published ${diaries.length} API diaries, ${letters.length} fictional letters, ${savedWords.length} fictional word saves. Week 39 remains ungenerated.`);
}

// 실제 제품 app/components는 수정하지 않고 별도 Next.js 앱에서 공통 모듈을 import합니다.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("common JSON/data/storage compile in both Next.js server and client graphs and SSR", { timeout: 120_000 }, async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const fixture = await mkdtemp(join(dirname(root.replace(/\/$/u, "")), "common-next-probe-"));
  try {
    await mkdir(join(fixture, "lib"));
    await mkdir(join(fixture, "app"));
    await cp(join(root, "data"), join(fixture, "data"), { recursive: true });
    for (const file of ["data.js", "storage.js"]) await cp(join(root, "lib", file), join(fixture, "lib", file));
    await cp(join(root, "package.json"), join(fixture, "package.json"));
    await cp(join(root, "package-lock.json"), join(fixture, "package-lock.json"));
    await symlink(join(root, "node_modules"), join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(fixture, "next.config.mjs"), `export default { turbopack: { root: ${JSON.stringify(dirname(fixture))} } };\n`);
    await writeFile(join(fixture, "app/layout.js"), "export default function Layout({ children }) { return <html lang='ko'><body>{children}</body></html>; }\n");
    await writeFile(join(fixture, "app/page.js"), `
import { getTree, getDiaries } from '../lib/data.js';
import { getSelectedTreeId, getAllDiaries } from '../lib/storage.js';
import Client from './probe-client.js';
export default function Page() {
  if (getSelectedTreeId() !== null || getAllDiaries('tree-1').length !== 4) throw new Error('SSR_STORAGE_FAILED');
  return <><div>server-tree: {getTree('tree-1').name}</div><div>server-diaries: {getDiaries('tree-1').length}</div><Client /></>;
}
`);
    await writeFile(join(fixture, "app/probe-client.js"), `
'use client';
import { useSyncExternalStore } from 'react';
import { getTree } from '../lib/data.js';
import { getSelectedTreeId, getDiaryStorageSnapshot, subscribeToDiary } from '../lib/storage.js';
const serverSnapshot = () => null;
export default function Client() {
  const snapshot = useSyncExternalStore(subscribeToDiary, getDiaryStorageSnapshot, serverSnapshot);
  return <div>client-tree: {getTree('tree-1').name} · {snapshot === null && getSelectedTreeId() === null ? 'SSR-safe' : 'browser'}</div>;
}
`);
    const result = spawnSync(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build", fixture], {
      cwd: fixture, encoding: "utf8", timeout: 100_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    const html = await readFile(join(fixture, ".next/server/app/index.html"), "utf8");
    assert.match(html, /server-tree:.*홍이/u);
    assert.match(html, /server-diaries:.*4/u);
    assert.match(html, /client-tree:.*홍이/u);
    assert.match(html, /SSR-safe/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

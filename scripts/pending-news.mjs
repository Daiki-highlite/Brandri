#!/usr/bin/env node
/**
 * pending-news.mjs — 未執筆ニュースの「執筆に必要な情報だけ」を出す。
 *
 * 定期ルーティン（Claude）が news.json 全体（1,200行・6万字超）を読まずに済むようにするための入口。
 * update-news.mjs が追加した直後のアイテムは headline / sections が空なので、それだけを拾って出す。
 *
 * usage:
 *   node scripts/pending-news.mjs            # 未執筆アイテムを人が読める形で出す
 *   node scripts/pending-news.mjs --json     # 機械可読（JSON配列）
 *   node scripts/pending-news.mjs --id <id>  # 特定IDの現在値を確認する
 *   node scripts/pending-news.mjs --sample   # 直近の執筆済み1本を手本として本文ごと出す
 *
 * 未執筆が無ければ「未執筆のアイテムはありません」と出して終了コード0で終わる。
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEWS_PATH = resolve(ROOT, "project/data/news.json");

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const idFlag = argv.indexOf("--id");
const ONLY_ID = idFlag !== -1 ? argv[idFlag + 1] : null;

const news = JSON.parse(readFileSync(NEWS_PATH, "utf8"));

// build-data.mjs の公開ゲートと同じ判定（headline と sections が揃って初めて公開される）
const isWritten = (n) => !!(n.headline && Array.isArray(n.sections) && n.sections.length);

// --sample: 手本を「常に最新の執筆済み1本」から動的に出す。
// 特定IDを手本として文書に固定するとローリング保持(21件)で消えて参照切れになるため。
if (argv.includes("--sample")) {
  const sample = news.items.find(isWritten);
  if (!sample) {
    console.error("✗ 執筆済みのアイテムがまだありません（手本にできる記事なし）");
    process.exit(1);
  }
  const payload = {};
  for (const k of ["headline", "insight", "cat", "sections", "pullquote", "takeaways", "aside"]) {
    if (sample[k] !== undefined) payload[k] = sample[k];
  }
  console.log(`// 手本: ${sample.id}（${sample.date}）— write-article.mjs にそのまま渡せる形\n`);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const targets = ONLY_ID
  ? news.items.filter((n) => n.id === ONLY_ID)
  : news.items.filter((n) => !isWritten(n));

if (ONLY_ID && targets.length === 0) {
  console.error(`✗ id「${ONLY_ID}」は news.json に見つかりません`);
  process.exit(1);
}

// 執筆に要る最小限だけを渡す。insight/sections 等の既存本文は載せない（ここが軽量化の肝）。
const slim = targets.map((n) => ({
  id: n.id,
  date: n.date,
  cat: n.cat,
  title: n.title,
  source: n.source,
  thumb: n.thumb,
  written: isWritten(n),
}));

if (AS_JSON) {
  console.log(JSON.stringify(slim, null, 2));
  process.exit(0);
}

if (slim.length === 0) {
  console.log("• 未執筆のアイテムはありません（執筆は不要）。");
  process.exit(0);
}

console.log(ONLY_ID
  ? `${slim.length} 件（--id 指定）\n`
  : `未執筆 ${slim.length} 件（news.json 全 ${news.items.length} 件中）\n`);
for (const n of slim) {
  console.log(`【${n.id}】 ${n.date} / cat: ${n.cat}${n.written ? "  ※執筆済み" : ""}`);
  console.log(`  title : ${n.title}`);
  console.log(`  source: ${n.source?.name ?? "—"}`);
  console.log(`  url   : ${n.source?.url ?? "—"}`);
  console.log(`  thumb : ${n.thumb ?? "—"}`);
  console.log("");
}
console.log("執筆したら 1本ずつ:  node scripts/write-article.mjs <id> <本文JSONのパス>");
console.log("（news.json を直接 Read/Edit しないこと — ROUTINE.md §2 参照）");

#!/usr/bin/env node
/**
 * write-article.mjs — 1記事分の本文JSONを news.json の該当アイテムにマージする。
 *
 * 定期ルーティン（Claude）が news.json（1,200行・6万字超）を Read / Edit せずに執筆できるようにする。
 * エージェントは「1記事分の小さなJSON」だけを書き、このスクリプトが安全に差し込む。
 *
 * usage:
 *   node scripts/write-article.mjs <id> <本文JSONのパス>
 *   node scripts/write-article.mjs <id> -        # 標準入力から読む
 *   node scripts/write-article.mjs <id> <path> --force   # 執筆済みを上書きする
 *
 * 本文JSONの形（ROUTINE.md §2.5 の記事ハーネスに対応）:
 * {
 *   "headline":  "Brandri独自の見出し",
 *   "insight":   "標題リード（60〜90字）",
 *   "cat":       "経営",                        // 任意・推定が不自然なときだけ
 *   "sections": [
 *     { "num": "01", "h": "見出し", "p": ["段落", "段落"] },
 *     { "num": "02", "h": "見出し", "p": ["段落"] },
 *     { "num": "03", "h": "と、いうことで。", "p": ["段落"] },
 *     { "num": "04", "h": "Brandriの視点：〜", "p": ["段落"] }
 *   ],
 *   "pullquote": "Brandriの立場を一文で",
 *   "takeaways": ["…", "…"],
 *   "aside":     "口語のひとこと"
 * }
 *
 * 書き込み前に build-data.mjs と同じ検証（必須項目・sections の形・合計800〜1600字）を通す。
 * 落ちた場合 news.json は一切変更されない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEWS_PATH = resolve(ROOT, "project/data/news.json");

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const [id, src] = argv.filter((a) => !a.startsWith("--"));

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!id || !src) {
  die("usage: node scripts/write-article.mjs <id> <本文JSONのパス|-> [--force]");
}

// ---- 入力の読み込み ----
let raw;
try {
  raw = src === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(src), "utf8");
} catch (e) {
  die(`本文JSONを読めません: ${src}（${e.message}）`);
}
let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  die(`本文JSONが不正です: ${e.message}`);
}

// ---- 検証 ----
const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, "").length;
const errors = [];

for (const k of ["headline", "insight", "sections"]) {
  if (!payload[k]) errors.push(`${k} がありません（未執筆のまま公開されません）`);
}
if (payload.sections && !Array.isArray(payload.sections)) {
  errors.push("sections が配列ではありません");
} else if (Array.isArray(payload.sections)) {
  if (payload.sections.length === 0) errors.push("sections が空です");
  payload.sections.forEach((s, i) => {
    if (!s || typeof s !== "object") return errors.push(`sections[${i}] がオブジェクトではありません`);
    if (!s.h) errors.push(`sections[${i}] に h（見出し）がありません`);
    if (!Array.isArray(s.p) || s.p.length === 0) errors.push(`sections[${i}] の p が段落の配列ではありません`);
    if (/<[^>]+>/.test(String(s.h ?? ""))) errors.push(`sections[${i}] の h にタグが入っています（見出しにタグ不可）`);
  });
}
if (payload.pullquote && /<[^>]+>/.test(payload.pullquote)) {
  errors.push("pullquote にタグが入っています（タグ不可）");
}
if (payload.takeaways && !Array.isArray(payload.takeaways)) {
  errors.push("takeaways が配列ではありません");
}

// build-data.mjs:215-219 と同一の字数計算
const total = plain(payload.insight) + plain(payload.pullquote)
  + (Array.isArray(payload.sections)
    ? payload.sections.reduce(
        (sum, s) => sum + plain(s?.h) + (Array.isArray(s?.p) ? s.p.map(plain).reduce((a, b) => a + b, 0) : 0),
        0,
      )
    : 0)
  + (Array.isArray(payload.takeaways) ? payload.takeaways.map(plain).reduce((a, b) => a + b, 0) : 0);

if (errors.length) {
  console.error(`✗ ${id} の本文JSONに不備があります:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  console.error("news.json は変更していません。");
  process.exit(1);
}

// ---- マージ ----
const news = JSON.parse(readFileSync(NEWS_PATH, "utf8"));
const idx = news.items.findIndex((n) => n.id === id);
if (idx === -1) die(`id「${id}」が news.json に見つかりません（node scripts/pending-news.mjs で確認）`);

const item = news.items[idx];
const alreadyWritten = !!(item.headline && Array.isArray(item.sections) && item.sections.length);
if (alreadyWritten && !FORCE) {
  die(`${id} は既に執筆済みです。既存アイテムの書き換えは ROUTINE.md で禁止されています（意図的なら --force）`);
}

// 執筆フィールドのみ差し込む。id/date/title/source/thumb/color/pattern は触らない。
const WRITABLE = ["headline", "insight", "sections", "pullquote", "takeaways", "aside", "cat"];
for (const k of WRITABLE) {
  if (payload[k] !== undefined) item[k] = payload[k];
}

// キー順を正規化する。書き込み経路によって順序がぶれると git diff が無用に膨らむため、
// 当該アイテムだけ常に同じ並びに揃える（値は変えない）。
const FIELD_ORDER = [
  "id", "date", "cat", "title", "source", "thumb", "color", "pattern",
  "headline", "insight", "aside", "sections", "pullquote", "takeaways",
];
const ordered = {};
for (const k of FIELD_ORDER) if (item[k] !== undefined) ordered[k] = item[k];
for (const k of Object.keys(item)) if (ordered[k] === undefined) ordered[k] = item[k]; // 未知キーは末尾に温存
news.items[idx] = ordered;

writeFileSync(NEWS_PATH, JSON.stringify(news, null, 2) + "\n");

console.log(`✓ ${id} を更新（本文 ${total}字）`);
if (total < 800) console.warn(`⚠ ${total}字は短めです（規定: 800〜1600字）— 加筆を検討すること`);
if (total > 1800) console.warn(`⚠ ${total}字は長めです（規定: 800〜1600字）— 圧縮を検討すること`);

const remaining = news.items.filter((n) => !(n.headline && Array.isArray(n.sections) && n.sections.length));
console.log(remaining.length
  ? `  残り未執筆: ${remaining.length}件（${remaining.map((n) => n.id).join(", ")}）`
  : "  未執筆なし。node scripts/build-data.mjs へ進む。");

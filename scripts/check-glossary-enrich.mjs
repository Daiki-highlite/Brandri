#!/usr/bin/env node
/**
 * check-glossary-enrich.mjs — 増補した用語集本文の品質を機械的に点検する。
 *
 *   node scripts/check-glossary-enrich.mjs
 *
 * 337ページに同じ型の文が並ぶと、増補はかえって逆効果になる。
 * ここでは公開前に次を洗い出す:
 *   1. 用語をまたいだ言い回しの使い回し（N-gram の重複）
 *   2. 既存本文（meaning/origin/usage）の言い換えになっている追記
 *   3. 増補が未適用の語
 *   4. contrast.with の参照先が実在するか / 偏っていないか
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const items = JSON.parse(readFileSync(resolve(ROOT, "project/data/glossary.json"), "utf8")).items;
const bySlug = new Map(items.map((g) => [g.slug, g]));

const plain = (s) => String(s).replace(/<[^>]+>/g, "");

// 用語名そのものは、複数ページに現れて当然（「カスタマージャーニーは、」など）。
// 使い回しの判定から外さないと、実際の定型文が数字に埋もれる。
const NAMES = items.map((g) => g.t).filter((t) => t.length >= 5).sort((a, b) => b.length - a.length);
const stripNames = (s) => NAMES.reduce((acc, n) => acc.split(n).join("　"), s);

// 本文として読まれる追記。FAQ の質問文は「◯◯はどう測ればよいですか？」のように
// 用語名＋定型の疑問形になるのが自然なので、使い回し判定の対象にしない。
const addedTexts = (g) => [
  ...(g.contrast || []).flatMap((c) => c.text || []),
  ...(g.misuse || []),
  ...(g.practice || []),
  ...(g.faq || []).map((f) => f.a),
].map(plain);
const baseText = (g) => [g.def, ...(g.meaning || []), ...(g.origin || []), ...(g.usage || [])].map(plain).join("");

const enriched = items.filter((g) => (g.faq || []).length);
const missing = items.filter((g) => !(g.faq || []).length);

console.log(`増補済み ${enriched.length} / ${items.length}語`);
if (missing.length) {
  console.log(`\n[未適用 ${missing.length}語]`);
  console.log("  " + missing.slice(0, 30).map((g) => g.slug).join(", ") + (missing.length > 30 ? ` … 他${missing.length - 30}語` : ""));
}

// ---- 1. 用語をまたいだ言い回しの使い回し ----
// 12文字の連続部分文字列が別々の用語に現れたら、テンプレ的な文の疑い。
const N = 12;
const gramOwners = new Map();
for (const g of enriched) {
  const seen = new Set();
  for (const raw of addedTexts(g)) {
    const t = stripNames(raw);
    for (let i = 0; i + N <= t.length; i++) {
      const gram = t.slice(i, i + N);
      if (/[　]/.test(gram) || /^[、。「」\s]+$/.test(gram)) continue;
      seen.add(gram);
    }
  }
  for (const gram of seen) {
    if (!gramOwners.has(gram)) gramOwners.set(gram, new Set());
    gramOwners.get(gram).add(g.slug);
  }
}
const shared = [...gramOwners.entries()]
  .filter(([, owners]) => owners.size >= 3)
  .sort((a, b) => b[1].size - a[1].size);

console.log(`\n[使い回しの疑い] ${N}文字が3語以上で共通: ${shared.length}件`);
for (const [gram, owners] of shared.slice(0, 25)) {
  console.log(`  ${owners.size}語  「${gram}」  ${[...owners].slice(0, 6).join(", ")}${owners.size > 6 ? " …" : ""}`);
}

// ---- 2. 既存本文の言い換えになっていないか ----
// 追記の各段落について、既存本文と共有する8文字グラムの割合を見る。
const M = 8;
const overlaps = [];
for (const g of enriched) {
  const base = baseText(g);
  const baseGrams = new Set();
  for (let i = 0; i + M <= base.length; i++) baseGrams.add(base.slice(i, i + M));
  for (const t of addedTexts(g)) {
    if (t.length < M * 2) continue;
    let hit = 0, tot = 0;
    for (let i = 0; i + M <= t.length; i++) { tot++; if (baseGrams.has(t.slice(i, i + M))) hit++; }
    const ratio = tot ? hit / tot : 0;
    if (ratio > 0.25) overlaps.push({ slug: g.slug, ratio, t });
  }
}
overlaps.sort((a, b) => b.ratio - a.ratio);
console.log(`\n[既存本文の言い換えの疑い] 重複率25%超: ${overlaps.length}件`);
for (const o of overlaps.slice(0, 15)) {
  console.log(`  ${(o.ratio * 100).toFixed(0)}%  ${o.slug}  ${o.t.slice(0, 60)}…`);
}

// ---- 3. contrast.with の健全性 ----
const bad = [];
const refCount = new Map();
for (const g of enriched) {
  for (const c of g.contrast || []) {
    if (!bySlug.has(c.with)) bad.push(`${g.slug} → ${c.with}（実在しない）`);
    else if (c.with === g.slug) bad.push(`${g.slug} → 自己参照`);
    refCount.set(c.with, (refCount.get(c.with) || 0) + 1);
  }
}
console.log(`\n[contrast.with] 不正 ${bad.length}件`);
bad.slice(0, 20).forEach((b) => console.log(`  - ${b}`));
const top = [...refCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("  参照が集中している語:");
top.forEach(([s, n]) => console.log(`    ${String(n).padStart(3)}回  ${s}（${bySlug.get(s)?.t ?? "?"}）`));

// ---- 4. 分量 ----
const lens = enriched.map((g) => addedTexts(g).reduce((n, t) => n + t.length, 0)).sort((a, b) => a - b);
if (lens.length) {
  const med = lens[Math.floor(lens.length / 2)];
  console.log(`\n[追加分量] 中央値 ${med}字 / 最小 ${lens[0]}字 / 最大 ${lens[lens.length - 1]}字`);
}

if (bad.length || missing.length) process.exitCode = 2;

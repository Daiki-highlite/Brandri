#!/usr/bin/env node
/**
 * merge-glossary-enrich.mjs — 生成した追記コンテンツを data/glossary.json へ取り込む。
 *
 *   node scripts/merge-glossary-enrich.mjs <入力JSON…>
 *
 * 入力は [{slug, contrast, misuse, practice, faq}, …] の配列。
 * 取り込む前に次を検証し、1件でも落ちたらその項目をスキップして最後に報告する
 * （壊れた内容を 337 ページへ一括で流し込まないための関門）:
 *   - slug が glossary.json に存在する
 *   - contrast[].with が実在する slug で、自己参照でない
 *   - 使ってよいタグは <em> だけ
 *   - 検証できない事実主張（数値・年号・「〜によると」等）を含まない
 *   - 各フィールドの件数・字数がレンジ内
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLOSSARY = resolve(ROOT, "project/data/glossary.json");

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("使い方: node scripts/merge-glossary-enrich.mjs <入力JSON…>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(GLOSSARY, "utf8"));
const bySlug = new Map(data.items.map((g) => [g.slug, g]));

const plain = (s) => String(s).replace(/<em>|<\/em>/g, "");
// <em> 以外のタグが混ざっていないか
const badTag = (s) => /<(?!\/?em>)[^>]+>/.test(String(s));
// 検証できない事実主張の検出。狙いは「数字つきの主張」と「出典を騙る書き方」で、
// 「統計ではない」のように概念として語を使う文まで弾かないよう、単独の一般語は対象にしない。
// 「によると」は「図の性質によるところ」のような連なりにも現れるため、後続を除外する。
const FACTUAL = /[0-9０-９]+\s*(%|％|割|倍|社|人|年|件|位|ポイント)|によると(?!ころ)|によれば|株式会社|Inc\.|『|』/;

// 数字を含む用語名（例「2025年の崖」「4C」）を先に取り除くための一覧。長い順に消す。
const TERM_NAMES = data.items
  .map((g) => g.t)
  .filter((t) => /[0-9０-９]/.test(t))
  .sort((a, b) => b.length - a.length);
const stripTermNames = (s) => TERM_NAMES.reduce((acc, t) => acc.split(t).join(""), s);
// その語自身の名前に含まれる数字（例「2025年の崖」の 2025）は、本文で言及されても事実主張ではない。
const stripOwnDigits = (s, g) => {
  const digits = String(g.t).match(/[0-9０-９]+/g);
  return digits ? digits.reduce((acc, d) => acc.split(d).join(""), s) : s;
};

const errors = [];
const applied = [];

for (const file of inputs) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${file}: JSONとして読めない — ${e.message}`);
    continue;
  }
  if (!Array.isArray(rows)) { errors.push(`${file}: 配列ではない`); continue; }

  for (const r of rows) {
    const where = `${file}#${r && r.slug}`;
    const bad = (msg) => errors.push(`${where}: ${msg}`);
    const g = bySlug.get(r && r.slug);
    if (!g) { bad("slug が glossary.json に存在しない"); continue; }

    const texts = [];
    let ok = true;

    // contrast
    const contrast = Array.isArray(r.contrast) ? r.contrast : [];
    if (contrast.length < 1 || contrast.length > 2) { bad(`contrast の組数が範囲外 (${contrast.length})`); ok = false; }
    for (const c of contrast) {
      if (!bySlug.has(c && c.with)) { bad(`contrast.with が実在しない slug: ${c && c.with}`); ok = false; }
      if (c && c.with === r.slug) { bad("contrast.with が自己参照"); ok = false; }
      const t = Array.isArray(c && c.text) ? c.text : [];
      if (t.length < 1 || t.length > 3) { bad(`contrast.text の段落数が範囲外 (${t.length})`); ok = false; }
      texts.push(...t);
    }

    // misuse
    const misuse = Array.isArray(r.misuse) ? r.misuse : [];
    if (misuse.length < 1 || misuse.length > 3) { bad(`misuse の段落数が範囲外 (${misuse.length})`); ok = false; }
    texts.push(...misuse);

    // practice
    const practice = Array.isArray(r.practice) ? r.practice : [];
    if (practice.length < 3 || practice.length > 6) { bad(`practice の項目数が範囲外 (${practice.length})`); ok = false; }
    texts.push(...practice);

    // faq
    const faq = (Array.isArray(r.faq) ? r.faq : []).filter((f) => f && f.q && f.a);
    if (faq.length < 2 || faq.length > 4) { bad(`faq の組数が範囲外 (${faq.length})`); ok = false; }
    texts.push(...faq.map((f) => f.q), ...faq.map((f) => f.a));

    for (const s of texts) {
      if (typeof s !== "string" || !s.trim()) { bad("空のテキストがある"); ok = false; break; }
      if (badTag(s)) { bad(`<em> 以外のタグが混ざっている: ${String(s).slice(0, 40)}…`); ok = false; break; }
      // 「2025年の崖」のように、用語名そのものに数字が含まれる場合がある。
      // 用語名を取り除いてから判定し、名前を事実主張と誤検出しない。
      if (FACTUAL.test(stripOwnDigits(stripTermNames(plain(s)), g))) { bad(`検証できない事実主張の疑い: ${plain(s).slice(0, 50)}…`); ok = false; break; }
    }
    if (!ok) continue;

    const added = texts.reduce((n, s) => n + plain(s).length, 0);
    g.contrast = contrast;
    g.misuse = misuse;
    g.practice = practice;
    g.faq = faq;
    applied.push({ slug: r.slug, added });
  }
}

if (applied.length) {
  writeFileSync(GLOSSARY, JSON.stringify(data, null, 1) + "\n");
}

const totalAdded = applied.reduce((n, a) => n + a.added, 0);
console.log(`✓ 取り込み ${applied.length}語 / 追加テキスト計 ${totalAdded.toLocaleString()}字（平均 ${applied.length ? Math.round(totalAdded / applied.length) : 0}字）`);
const enriched = data.items.filter((g) => Array.isArray(g.faq) && g.faq.length).length;
console.log(`  用語集の増補済み: ${enriched} / ${data.items.length}語`);
if (errors.length) {
  console.log(`\n✗ スキップ ${errors.length}件:`);
  for (const e of errors.slice(0, 40)) console.log(`  - ${e}`);
  if (errors.length > 40) console.log(`  … 他 ${errors.length - 40}件`);
  process.exitCode = 2;
}

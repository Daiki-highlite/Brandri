#!/usr/bin/env node
/**
 * apply-glossary-fixes.mjs — 書き直した文を data/glossary.json の該当箇所へ差し戻す。
 *
 *   node scripts/apply-glossary-fixes.mjs <入力JSON…>
 *
 * 入力は [{slug, field, index, text}, …]。field は次のいずれか:
 *   contrast.<n>.text / misuse / practice / faq.a
 *
 * 差し替え前に、置き換え先が実在すること・字数がレンジ内であること・
 * <em> 以外のタグや検証できない事実主張が混ざっていないことを確かめる。
 * 落ちた項目は元の文のまま残し、最後にまとめて報告する。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLOSSARY = resolve(ROOT, "project/data/glossary.json");

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("使い方: node scripts/apply-glossary-fixes.mjs <入力JSON…>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(GLOSSARY, "utf8"));
const bySlug = new Map(data.items.map((g) => [g.slug, g]));

const plain = (s) => String(s).replace(/<[^>]+>/g, "");
const badTag = (s) => /<(?!\/?em>)[^>]+>/.test(String(s));
const TERM_NAMES = data.items.map((g) => g.t).filter((t) => /[0-9０-９]/.test(t)).sort((a, b) => b.length - a.length);
const stripTermNames = (s) => TERM_NAMES.reduce((acc, t) => acc.split(t).join(""), s);
const stripOwnDigits = (s, g) => {
  const d = String(g.t).match(/[0-9０-９]+/g);
  return d ? d.reduce((acc, x) => acc.split(x).join(""), s) : s;
};
const FACTUAL = /[0-9０-９]+\s*(%|％|割|倍|社|人|年|件|位|ポイント)|によると(?!ころ)|によれば|株式会社|Inc\.|『|』/;

// フィールドごとの想定字数。書き直しで極端に短く/長くなっていないかを見る。
const RANGE = { practice: [50, 130], misuse: [110, 230], "faq.a": [100, 230], contrast: [100, 220] };

const errors = [];
let applied = 0;

for (const file of inputs) {
  let rows;
  try { rows = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { errors.push(`${file}: JSONとして読めない — ${e.message}`); continue; }
  if (!Array.isArray(rows)) { errors.push(`${file}: 配列ではない`); continue; }

  for (const r of rows) {
    const where = `${file}#${r && r.slug}/${r && r.field}[${r && r.index}]`;
    const bad = (m) => errors.push(`${where}: ${m}`);
    const g = bySlug.get(r && r.slug);
    if (!g) { bad("slug が存在しない"); continue; }
    if (typeof r.text !== "string" || !r.text.trim()) { bad("text が空"); continue; }
    if (badTag(r.text)) { bad("<em> 以外のタグが混ざっている"); continue; }
    if (FACTUAL.test(stripOwnDigits(stripTermNames(plain(r.text)), g))) { bad("検証できない事実主張の疑い"); continue; }

    // 差し替え先の解決
    let arr = null, kind = null;
    const m = /^contrast\.(\d+)\.text$/.exec(r.field);
    if (m) { arr = (g.contrast || [])[Number(m[1])]?.text; kind = "contrast"; }
    else if (r.field === "misuse") { arr = g.misuse; kind = "misuse"; }
    else if (r.field === "practice") { arr = g.practice; kind = "practice"; }
    else if (r.field === "faq.a") { kind = "faq.a"; }
    else { bad(`未知の field: ${r.field}`); continue; }

    const [lo, hi] = RANGE[kind];
    const len = plain(r.text).length;
    if (len < lo || len > hi) { bad(`字数が範囲外 (${len}字 / 想定${lo}〜${hi})`); continue; }

    if (kind === "faq.a") {
      const f = (g.faq || [])[r.index];
      if (!f) { bad("faq の該当位置が無い"); continue; }
      f.a = r.text;
    } else {
      if (!Array.isArray(arr) || arr[r.index] === undefined) { bad("該当位置が無い"); continue; }
      arr[r.index] = r.text;
    }
    applied++;
  }
}

if (applied) writeFileSync(GLOSSARY, JSON.stringify(data, null, 1) + "\n");
console.log(`✓ 書き直しを反映 ${applied}文`);
if (errors.length) {
  console.log(`\n✗ 反映できなかった ${errors.length}件（元の文のまま）:`);
  for (const e of errors.slice(0, 40)) console.log(`  - ${e}`);
  if (errors.length > 40) console.log(`  … 他 ${errors.length - 40}件`);
  process.exitCode = 2;
}

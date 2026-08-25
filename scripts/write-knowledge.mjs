#!/usr/bin/env node
/**
 * write-knowledge.mjs — 1記事分のJSONを articles.json に追加／更新する。
 *
 * write-article.mjs（news.json 用）の articles.json 版。
 * articles.json は約389KB あり、Read / Edit すると実行コストの大半を食う。
 * エージェントは「1記事分の小さなJSON」だけを書き、このスクリプトが安全に差し込む。
 *
 * usage:
 *   node scripts/write-knowledge.mjs <記事JSONのパス>
 *   node scripts/write-knowledge.mjs -                  # 標準入力から読む
 *   node scripts/write-knowledge.mjs <path> --force      # 既存 num を上書きする
 *   node scripts/write-knowledge.mjs <path> --next-num   # num を自動採番（401〜）
 *
 * 記事JSONの形（SPEC_DESIGNER_TRACK 00_MASTER §4 のハーネスに対応）:
 * {
 *   "num":   401,                          // --next-num 指定時は省略可
 *   "cat":   "ツール",                      // 既存カテゴリに寄せる
 *   "title": "検索語入りの実務見出し",
 *   "date":  "2026.08.20",                 // 省略時は本日（既存記事の更新時は元の日付を維持）
 *   "target_reader": ["designer"],         // 省略時は ["designer"]
 *   "slug":  "ai-design-tools",
 *   "keyword": "AI デザインツール",
 *   "lead":  "制作現場のあるあるから（80〜120字）",
 *   "sections": [
 *     { "num": "01", "h": "制作の型",             "p": ["段落", "段落"] },
 *     { "num": "02", "h": "良し悪しの分かれ目",   "p": ["段落"] },
 *     { "num": "03", "h": "ブランドから逆算する", "p": ["段落"] },
 *     { "num": "04", "h": "AIとの分業",           "p": ["段落"] }
 *   ],
 *   "pullquote": "1文",
 *   "takeaways": ["…", "…"],
 *   "related":   [{ "t": "…", "href": "articles/….html" }],
 *   "sources":   [{ "key": "…", "title": "…", "author": "Highlite 編集部", "year": 2026, "type": "編" }],
 *   "aside":     "口語のひとこと"
 * }
 *
 * --force で既存記事を更新するときは、変更したいフィールドだけを書けばよい。
 * 検証もマージ後の姿（既存アイテム + 今回のJSON）に対して行うため、
 * 既に articles.json にある cat / slug / sections / sources を書き直す必要はない。
 * 既定値（date / color / pattern / target_reader）の補完も、既存アイテムにも今回のJSONにも
 * 値が無いときだけ働く。つまり更新で既存の日付や配色が勝手に書き換わることはない。
 *
 * 書き込み前に build-data.mjs と同じ検証（必須項目・sections 3節以上・sources・slug 形式／重複・
 * num 重複・md 本文の実在）を通す。
 * 加えて build-data.mjs が見ていない項目（見出しのタグ混入・英字全大文字）も落とす。
 * 字数（2,000〜2,600字）と related 3本は警告のみで通す。
 * 落ちた場合 articles.json は一切変更されない。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_PATH = resolve(ROOT, "project/data/articles.json");

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const NEXT_NUM = argv.includes("--next-num");
const [src] = argv.filter((a) => !a.startsWith("--"));

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!src) {
  die("usage: node scripts/write-knowledge.mjs <記事JSONのパス|-> [--force] [--next-num]");
}

// ---- 入力の読み込み ----
let raw;
try {
  raw = src === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(src), "utf8");
} catch (e) {
  die(`記事JSONを読めません: ${src}（${e.message}）`);
}
let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  die(`記事JSONが不正です: ${e.message}`);
}

// ---- articles.json の読み込み（既存アイテムとマージしてから検証するため先に読む）----
let articles;
try {
  articles = JSON.parse(readFileSync(ARTICLES_PATH, "utf8"));
} catch (e) {
  die(`articles.json を読めません（${e.message}）`);
}
if (!Array.isArray(articles.items) || !articles.items.length) {
  die("articles.json の items が配列ではないか空です");
}

// ---- 自動採番 ----
const TRACK_START = 401; // 第3トラック（トレンド）の開始番号。190-264=経営者 / 301-337=デザイナー
if (NEXT_NUM && payload.num === undefined) {
  const used = articles.items
    .map((a) => Number(String(a.num)))
    .filter((n) => Number.isFinite(n) && n >= TRACK_START);
  payload.num = used.length ? Math.max(...used) + 1 : TRACK_START;
}

// ---- 既存アイテムとのマージ ----
// 検証はここで作る merged（= 更新後の記事の姿）に対して行う。
// payload 単体を検証すると、更新のたびに cat / slug / sections / sources の再提出を
// 強いることになり、「変更したい所だけ書く」という使い方ができなくなる。
const existingIdx = payload.num === undefined
  ? -1
  : articles.items.findIndex((a) => String(a.num) === String(payload.num));
const base = existingIdx === -1 ? {} : articles.items[existingIdx];
const merged = { ...base, ...payload };

// ---- 既定値の補完 ----
// merged に対して行う。既存アイテムが値を持っていればそれが残るため、
// 更新時に元の日付・配色・読者区分が既定値で潰れることはない。
if (merged.date === undefined) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  merged.date = `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
}
if (merged.target_reader === undefined) merged.target_reader = ["designer"];

// 見た目の既定値（build-data.mjs が必須にしているため、無ければ num から決める）
const COLORS = ["#1E2340", "#3D5070", "#9B8CC8", "#7BBAD4", "#C8A4C4", "#8CC4D0"];
const PATTERNS = ["diagonal", "dots", "lines", "grid"];
const seed = Number(String(merged.num).replace(/\D/g, "")) || 0;
if (merged.color === undefined) merged.color = COLORS[seed % COLORS.length];
if (merged.pattern === undefined) merged.pattern = PATTERNS[seed % PATTERNS.length];

// ---- 検証 ----
const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, "").length;
const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "");
const errors = [];

// build-data.mjs:93-127 と同じ必須項目
for (const k of ["num", "cat", "title", "date", "color", "pattern"]) {
  if (merged[k] === undefined || merged[k] === null || merged[k] === "") {
    errors.push(`${k} がありません（build-data.mjs が必須にしています）`);
  }
}

// slug（これがあると project/articles/<slug>.html が生成される）
if (!merged.slug) {
  errors.push("slug がありません（記事ページが生成されません）");
} else if (!/^[a-z0-9-]+$/.test(merged.slug)) {
  errors.push(`slug「${merged.slug}」は英小文字・数字・ハイフンのみ使えます`);
}

if (merged.md) {
  // 長文Markdown記事は sections / sources を持たない代わりに本文ファイルが要る。
  // build-data.mjs:117-118 と同じ実在チェック。ここで落とさないと、
  // articles.json を書き換えた後にビルドが落ちる。
  if (!existsSync(resolve(ROOT, `project/data/longform/${merged.md}.md`))) {
    errors.push(`md 本文が見つかりません: project/data/longform/${merged.md}.md`);
  }
} else {
  // sections（build-data.mjs は 3節以上を必須にしている）
  if (!Array.isArray(merged.sections)) {
    errors.push("sections が配列ではありません");
  } else if (merged.sections.length < 3) {
    errors.push(`sections が${merged.sections.length}節しかありません（3節以上必要）`);
  } else {
    merged.sections.forEach((s, i) => {
      if (!s || typeof s !== "object") return errors.push(`sections[${i}] がオブジェクトではありません`);
      if (!s.h) errors.push(`sections[${i}] に h（見出し）がありません`);
      if (!Array.isArray(s.p) || s.p.length === 0) errors.push(`sections[${i}] の p が段落の配列ではありません`);
      if (/<[^>]+>/.test(String(s.h ?? ""))) errors.push(`sections[${i}] の h にタグが入っています（見出しにタグ不可）`);
    });
  }

  // lead（main.js:69 は slug と lead が揃った記事だけを §04 のグリッドに出す）
  if (!merged.lead) {
    errors.push("lead がありません（knowledge の読み物グリッドに出ません）");
  }

  // sources（build-data.mjs:「出典なき記事は公開できません」）
  if (!Array.isArray(merged.sources) || !merged.sources.length) {
    errors.push("sources がありません（出典なき記事は公開できません）");
  } else {
    merged.sources.forEach((s, i) => {
      if (!s || typeof s !== "object") return errors.push(`sources[${i}] がオブジェクトではありません`);
      for (const k of ["key", "title", "author"]) {
        if (!s[k]) errors.push(`sources[${i}] に ${k} がありません`);
      }
    });
  }
}

if (merged.pullquote && /<[^>]+>/.test(merged.pullquote)) {
  errors.push("pullquote にタグが入っています（タグ不可）");
}
if (merged.takeaways && !Array.isArray(merged.takeaways)) {
  errors.push("takeaways が配列ではありません");
}
if (merged.related !== undefined) {
  if (!Array.isArray(merged.related)) {
    errors.push("related が配列ではありません");
  } else {
    merged.related.forEach((r, i) => {
      if (!r || typeof r !== "object") return errors.push(`related[${i}] がオブジェクトではありません`);
      for (const k of ["t", "href"]) if (!r[k]) errors.push(`related[${i}] に ${k} がありません`);
    });
  }
}
if (!Array.isArray(merged.target_reader)) {
  errors.push("target_reader が配列ではありません");
}

// 英字全大文字の禁止（ROUTINE.md「ブランド毀損」）。頭字語と他社公式表記は除外する。
const ACRONYM_OK = new Set([
  "AI", "VI", "CI", "UI", "UX", "SNS", "LP", "MVV", "PMF", "CTA", "SEO", "AEO",
  "EC", "CV", "CVR", "KPI", "KGI", "ROI", "CEO", "CTO", "CXO", "PR",
  "URL", "HTML", "CSS", "JS", "API", "PDF", "SVG", "PNG", "JPG", "RGB", "CMYK",
  "OGP", "DM", "TV", "IT", "DX", "OK", "NG", "QA", "FAQ",
]);
const collectText = [
  merged.title, merged.lead, merged.pullquote, merged.aside, merged.keyword,
  ...(Array.isArray(merged.takeaways) ? merged.takeaways : []),
  ...(Array.isArray(merged.sections)
    ? merged.sections.flatMap((s) => [s?.h, ...(Array.isArray(s?.p) ? s.p : [])])
    : []),
].map(strip).join("\n");
const shouty = [...new Set(collectText.match(/\b[A-Z]{2,}\b/g) ?? [])].filter((w) => !ACRONYM_OK.has(w));
if (shouty.length) {
  errors.push(`英字の全大文字が使われています: ${shouty.join(", ")}（頭字語以外は不可。Highlite/Brandri は先頭大文字）`);
}

// num / slug の重複（--force のときは同一記事の上書きなので除外して判定する）
if (existingIdx !== -1 && !FORCE) {
  errors.push(`num「${merged.num}」は既に使われています（上書きするなら --force）`);
}
const slugOwner = articles.items.findIndex((a) => a.slug && a.slug === merged.slug);
if (slugOwner !== -1 && slugOwner !== existingIdx) {
  errors.push(`slug「${merged.slug}」は num ${articles.items[slugOwner].num} が使っています`);
}

if (errors.length) {
  console.error(`✗ 記事JSON（num ${merged.num ?? "?"}）に不備があります:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  console.error("articles.json は変更していません。");
  process.exit(1);
}

// ---- 字数（警告のみ）----
// 実測に合わせ lead + sections + pullquote + takeaways + aside を数える
const total = plain(merged.lead) + plain(merged.pullquote) + plain(merged.aside)
  + (Array.isArray(merged.sections)
    ? merged.sections.reduce(
        (sum, s) => sum + plain(s?.h) + (Array.isArray(s?.p) ? s.p.map(plain).reduce((a, b) => a + b, 0) : 0),
        0,
      )
    : 0)
  + (Array.isArray(merged.takeaways) ? merged.takeaways.map(plain).reduce((a, b) => a + b, 0) : 0);

// ---- 書き込み ----
// キー順を正規化する。書き込み経路によって順序がぶれると git diff が無用に膨らむため、
// 当該アイテムだけ常に同じ並びに揃える（値は変えない）。
const FIELD_ORDER = [
  "num", "cat", "title", "date", "color", "pattern", "target_reader", "slug", "keyword",
  "lead", "sections", "pullquote", "takeaways", "related", "sources", "aside", "md",
];
const ordered = {};
for (const k of FIELD_ORDER) if (merged[k] !== undefined) ordered[k] = merged[k];
for (const k of Object.keys(merged)) if (ordered[k] === undefined) ordered[k] = merged[k]; // 未知キーは末尾に温存

if (existingIdx === -1) {
  articles.items.push(ordered);
} else {
  articles.items[existingIdx] = ordered;
}

writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2) + "\n");

console.log(
  existingIdx === -1
    ? `✓ num ${merged.num}「${merged.title}」を追加（本文 ${total}字）`
    : `✓ num ${merged.num}「${merged.title}」を更新（本文 ${total}字）`,
);
console.log(`  slug: ${merged.slug} → project/articles/${merged.slug}.html`);
if (!merged.md) {
  if (total < 2000) console.warn(`⚠ ${total}字は短めです（規定: 2,000〜2,600字）— 加筆を検討すること`);
  if (total > 2600) console.warn(`⚠ ${total}字は長めです（規定: 2,000〜2,600字）— 圧縮を検討すること`);
  const relatedCount = Array.isArray(merged.related) ? merged.related.length : 0;
  if (relatedCount !== 3) {
    console.warn(`⚠ related が${relatedCount}本です（SPEC_DESIGNER_TRACK §4 は3本必須）`);
  }
}
console.log("  次: node scripts/build-data.mjs");

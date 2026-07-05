#!/usr/bin/env node
/**
 * build-data.mjs — data/*.json（単一の真実）から js/data.generated.js を生成する。
 *
 *   data/site.json      … サイト定数・入口データ・診断設問
 *   data/articles.json  … 読み物（spec 002 準拠: sources / target_reader 付き）
 *   data/cases.json     … 事例
 *   data/news.json      … 自動更新ニュース（update-news.mjs が書く）
 *
 * バリデーションに失敗した場合は exit 1（壊れたデータを配信させない）。
 * さらに index.html の <script id="ld-news"> ブロック（JSON-LD）を
 * ニュースの最新状態で書き換える。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (p) => resolve(ROOT, p);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fail = (msg) => { console.error(`✗ build-data: ${msg}`); process.exit(1); };
const readJson = (p) => {
  try { return JSON.parse(readFileSync(P(p), "utf8")); }
  catch (e) { fail(`${p} を読めません: ${e.message}`); }
};

// ---------- load ----------
const site = readJson("project/data/site.json");
const articles = readJson("project/data/articles.json");
const cases = readJson("project/data/cases.json");
const news = readJson("project/data/news.json");
const entries = readJson("project/data/entries.json");
const situations = readJson("project/data/situations.json");
const basics = readJson("project/data/basics.json");

const BASE = (site.meta && site.meta.baseUrl) ? site.meta.baseUrl.replace(/\/$/, "") : "https://brandri.jp";
const CSS_VER = "20260706a"; // 生成ページの styles.css キャッシュバスター

// ---------- validate ----------
const req = (obj, keys, label) => {
  for (const k of keys) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === "")
      fail(`${label} に必須フィールド「${k}」がありません: ${JSON.stringify(obj).slice(0, 80)}…`);
  }
};

["issues", "phases", "terms", "questions", "knowledgeCategories"].forEach((k) => {
  if (!Array.isArray(site[k]) || site[k].length === 0) fail(`site.json の ${k} が空です`);
});
// §01 の各入口は corporate / business / both のいずれかに区分されている必要がある
["issues", "phases", "terms"].forEach((k) => {
  site[k].forEach((x, i) => {
    if (!["corporate", "business", "both"].includes(x.domain))
      fail(`site.json の ${k}[${i}]（${x.title}）の domain が不正です（corporate/business/both のいずれか）`);
  });
});
site.questions.forEach((q, i) => req(q, ["pillar", "pillarJa", "pillarNum", "q", "options", "weights"], `questions[${i}]`));

if (!Array.isArray(articles.items) || articles.items.length === 0) fail("articles.json の items が空です");
articles.items.forEach((a, i) => {
  req(a, ["num", "cat", "title", "date", "color", "pattern"], `articles[${i}]`);
  // エビデンス原則（001 FR-030 / 002 SC-102）: 出典必須
  if (!Array.isArray(a.sources) || a.sources.length === 0)
    fail(`articles[${i}] (№${a.num}) に sources がありません — 出典なき記事は公開できません`);
  a.sources.forEach((s, j) => req(s, ["key", "title", "author"], `articles[${i}].sources[${j}]`));
});
// 本文ページ化する記事（slug 付き）の追加検証: slug 一意・本文構成・内部導線の妥当性
{
  const seenSlug = new Set();
  const seenNum = new Set();
  articles.items.forEach((a, i) => {
    if (seenNum.has(String(a.num))) fail(`articles[${i}] num=${a.num} が重複しています`);
    seenNum.add(String(a.num));
    if (!a.slug) return;
    if (!/^[a-z0-9-]+$/.test(a.slug)) fail(`articles[${i}] (№${a.num}) slug が不正: "${a.slug}"（英小文字/数字/ハイフンのみ）`);
    if (seenSlug.has(a.slug)) fail(`articles[${i}] slug="${a.slug}" が重複しています`);
    seenSlug.add(a.slug);
    if (!Array.isArray(a.sections) || a.sections.length < 3)
      fail(`articles[${i}] (${a.slug}) sections が3節未満です`);
    a.sections.forEach((s, j) => req(s, ["h", "p"], `articles[${i}].sections[${j}]`));
    (a.related || []).forEach((r, j) => req(r, ["t", "href"], `articles[${i}].related[${j}]`));
  });
}

// Cases は Highlite Inc. 公式サイト（highlite.co.jp/work）の実績を実写真・実リンクで掲載する。
cases.items.forEach((c, i) => req(c, ["num", "cat", "client", "title", "year", "url", "photo", "excerpt"], `cases[${i}]`));

// 入口詳細（課題/フェーズ/用語）: 4つの必須章 — ナレッジ / 解決方法例 / 他社事例 / Highliteの観点
if (!Array.isArray(entries.items) || entries.items.length === 0) fail("entries.json の items が空です");
entries.items.forEach((e, i) => {
  req(e, ["type", "slug", "num", "title", "desc", "lead"], `entries[${i}]`);
  if (!["issue", "phase", "term"].includes(e.type)) fail(`entries[${i}] の type「${e.type}」が不正です`);
  if (!/^[a-z0-9-]+$/.test(e.slug)) fail(`entries[${i}] の slug「${e.slug}」が不正です（ファイル名になるため英小文字・数字・ハイフンのみ）`);
  if (!e.knowledge || !Array.isArray(e.knowledge.paras) || !e.knowledge.paras.length)
    fail(`entries[${i}] (${e.slug}) に knowledge（ブランドのナレッジ）がありません — 必須章です`);
  if (!e.solutions || !Array.isArray(e.solutions.steps) || !e.solutions.steps.length)
    fail(`entries[${i}] (${e.slug}) に solutions（課題解決方法例）がありません — 必須章です`);
  if (!e.cases || !Array.isArray(e.cases.works) || !e.cases.works.length)
    fail(`entries[${i}] (${e.slug}) に cases（他社事例）がありません — 必須章です`);
  if (!e.highlite || !Array.isArray(e.highlite.view) || !e.highlite.view.length)
    fail(`entries[${i}] (${e.slug}) に highlite（Highliteの観点）がありません — 必須章です`);
});

// 状況ランディング（Build/Grow/Renew）: 参照する入口(entries)と読み物(articles)が全て解決できること
if (!Array.isArray(situations.items) || situations.items.length === 0) fail("situations.json の items が空です");
const entrySlugSet = new Set(entries.items.map((e) => `${e.type}-${e.slug}`));
const articleNumSet = new Set(articles.items.map((a) => String(a.num)));
situations.items.forEach((s, i) => {
  req(s, ["slug", "stage", "num", "title", "subtitle", "lead", "pull"], `situations[${i}]`);
  if (!/^[a-z0-9-]+$/.test(s.slug)) fail(`situations[${i}] の slug「${s.slug}」が不正です`);
  if (!Array.isArray(s.framing) || !s.framing.length) fail(`situations[${i}] (${s.slug}) に framing がありません`);
  if (!Array.isArray(s.entries) || !s.entries.length) fail(`situations[${i}] (${s.slug}) に entries がありません`);
  s.entries.forEach((ref) => {
    if (!entrySlugSet.has(ref)) fail(`situations[${i}] (${s.slug}) の entries「${ref}」に対応する入口ページがありません`);
  });
  (s.reading || []).forEach((num) => {
    if (!articleNumSet.has(String(num))) fail(`situations[${i}] (${s.slug}) の reading「${num}」に対応する読み物がありません`);
  });
});

// ブランディング5大疑問（まずはここから）: 初心者向けの解説記事
if (!Array.isArray(basics.items) || basics.items.length === 0) fail("basics.json の items が空です");
basics.items.forEach((b, i) => {
  req(b, ["slug", "num", "q", "teaser", "lead", "pull"], `basics[${i}]`);
  if (!/^[a-z0-9-]+$/.test(b.slug)) fail(`basics[${i}] の slug「${b.slug}」が不正です`);
  if (!Array.isArray(b.sections) || b.sections.length < 2) fail(`basics[${i}] (${b.slug}) の sections が不足しています`);
  // 精緻ページの拡張フィールド（answer/figures/tabs/faq/terms）の検証
  if (b.answer) req(b.answer, ["one", "points"], `basics[${i}].answer`);
  (b.tabs?.items || []).forEach((t, j) => req(t, ["tab", "h", "p"], `basics[${i}].tabs.items[${j}]`));
  (b.faq || []).forEach((f, j) => req(f, ["q", "a"], `basics[${i}].faq[${j}]`));
  (b.terms || []).forEach((ref) => {
    if (!entrySlugSet.has(ref)) fail(`basics[${i}] (${b.slug}) の terms「${ref}」に対応する用語ページがありません`);
  });
  (b.figures || []).forEach((f, j) => {
    req(f, ["id", "src", "caption"], `basics[${i}].figures[${j}]`);
    if (!existsSync(P(`project/${f.src}`))) console.warn(`⚠ basics[${b.slug}] の図解が未配置: ${f.src}`);
  });
});

if (!Array.isArray(news.items)) fail("news.json の items が配列ではありません");
news.items.forEach((n, i) => {
  req(n, ["id", "date", "cat", "title"], `news[${i}]`);
  if (!n.source || !n.source.name || !n.source.url) fail(`news[${i}] に source(name/url) がありません — 出典なきニュースは掲載できません`);
  if (!/^[a-z0-9-]+$/.test(n.id)) fail(`news[${i}] の id「${n.id}」が不正です（ファイル名になるため英小文字・数字・ハイフンのみ）`);
  if (!n.insight) console.warn(`⚠ news[${i}] (${n.id}) の insight が未執筆です（掲載はされますが示唆なし）`);
  const hasSections = Array.isArray(n.sections) && n.sections.length > 0;
  const hasBody = Array.isArray(n.body) && n.body.length > 0;
  if (!hasSections && !hasBody) {
    console.warn(`⚠ news[${i}] (${n.id}) の本文（sections）が未執筆です — insightのみで簡易生成されます`);
  } else if (hasSections) {
    const plain = (s) => String(s || "").replace(/<[^>]+>/g, "").length;
    // 記事全体（標題リード + 見出し + 本文 + プルクオート + 示唆）の文字数目安 ≈ 1000字
    const total = plain(n.insight) + plain(n.pullquote)
      + n.sections.reduce((sum, s) => sum + plain(s.h) + (Array.isArray(s.p) ? s.p.map(plain).reduce((a, b) => a + b, 0) : 0), 0)
      + (Array.isArray(n.takeaways) ? n.takeaways.map(plain).reduce((a, b) => a + b, 0) : 0);
    if (total < 800) console.warn(`⚠ news[${i}] (${n.id}) の記事が ${total}字と短めです（目安: 約1000字）`);
  }
});
const urls = news.items.map((n) => n.source.url);
if (new Set(urls).size !== urls.length) fail("news.json に同一URLの重複があります");

// ---------- derive ----------
const latest = articles.items.slice(0, 7); // BRANDRI_LATEST 互換（knowledge 用）
const newsSorted = [...news.items].sort((a, b) => (a.date < b.date ? 1 : -1));

// 入口一覧（課題/フェーズ/用語）へ詳細ページの href を付与（entries.json と num で結線）
const entryHref = (e) => `entries/${e.type}-${e.slug}.html`;
const TYPE_TO_KEY = { issue: "issues", phase: "phases", term: "terms" };
for (const e of entries.items) {
  const list = site[TYPE_TO_KEY[e.type]];
  const hit = list.find((x) => x.num === e.num);
  if (!hit) fail(`entries.json の ${e.type}/${e.slug}（num:${e.num}）に対応する項目が site.json にありません`);
  if (hit.title !== e.title) console.warn(`⚠ entries/${e.slug} のタイトルが site.json と不一致（"${e.title}" vs "${hit.title}"）`);
  hit.href = entryHref(e);
}
const missingHref = ["issues", "phases", "terms"].flatMap((k) => site[k].filter((x) => !x.href).map((x) => `${k}:${x.title}`));
if (missingHref.length) fail(`詳細ページ未作成の入口項目があります: ${missingHref.join(", ")}`);

// Updated行: 読み物(articles)とニュース(news)を合わせた最新更新日と、その日の更新本数。
// news.json の日付更新（毎日の自動更新）も反映されるよう、両コレクションを横断して計算する。
const normDate = (s) => String(s || "").replace(/\./g, "-"); // "2026.04.18" -> "2026-04-18"
const allDated = [
  ...articles.items.map((a) => ({ date: normDate(a.date) })),
  ...news.items.map((n) => ({ date: normDate(n.date) })),
];
const latestDate = allDated.reduce((max, x) => (x.date > max ? x.date : max), "0000-00-00");
const updatedCount = allDated.filter((x) => x.date === latestDate).length;
const updatedLine = `${latestDate.replace(/-/g, ".")} — 更新 ${updatedCount}本`;

// ---------- emit js/data.generated.js ----------
const banner = `// ============================================================\n// AUTO-GENERATED by scripts/build-data.mjs — 手で編集しない。\n// 編集は project/data/*.json へ。生成: node scripts/build-data.mjs\n// ============================================================\n`;

const js = `${banner}
window.BRANDRI_DATA = ${JSON.stringify({ issues: site.issues, phases: site.phases, terms: site.terms }, null, 2)};

window.BRANDRI_CASES = ${JSON.stringify(cases.items, null, 2)};

// 読み物（全件・最新順）— sources / target_reader 付き（spec 002）
window.BRANDRI_KNOWLEDGE_ALL = ${JSON.stringify(articles.items, null, 2)};

// 互換: 先頭7本
window.BRANDRI_LATEST = ${JSON.stringify(latest, null, 2)};

window.BRANDRI_KNOWLEDGE_CATEGORIES = ${JSON.stringify(site.knowledgeCategories)};

window.BRANDRI_QUESTIONS = ${JSON.stringify(site.questions, null, 2)};

// 自動更新ニュース（scripts/update-news.mjs が data/news.json を更新）
window.BRANDRI_NEWS = ${JSON.stringify(newsSorted, null, 2)};

// 状況ランディング（トップの3カード用の最小情報）
window.BRANDRI_SITUATIONS = ${JSON.stringify(situations.items.map((s) => ({ slug: s.slug, stage: s.stage, num: s.num, title: s.title, subtitle: s.subtitle })), null, 2)};
`;

writeFileSync(P("project/js/data.generated.js"), js);
console.log(`✓ js/data.generated.js を生成（articles:${articles.items.length} / cases:${cases.items.length} / news:${news.items.length}）`);

// ---------- inject JSON-LD (news ItemList) into index.html ----------
const ldPath = P("project/index.html");
let html;
try { html = readFileSync(ldPath, "utf8"); } catch { html = null; }
if (html) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Brandri Daily Briefing — ニュースから読むブランドの論点",
    "itemListElement": newsSorted.slice(0, 9).map((n, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "NewsArticle",
        "headline": n.headline || n.title,
        "datePublished": n.date,
        // Brandri の詳細記事（自社ページ）を正とし、元ニュースは isBasedOn で参照する
        "url": `${BASE}/news/${n.id}.html`,
        "author": { "@type": "Organization", "name": "Highlite Inc." },
        "publisher": { "@type": "Organization", "name": "Highlite Inc." },
        "isBasedOn": n.source.url,
        "comment": n.insight ? { "@type": "Comment", "text": n.insight, "author": { "@type": "Organization", "name": "Brandri (Highlite Inc.)" } } : undefined
      }
    }))
  };
  const block = `<script type="application/ld+json" id="ld-news">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  const re = /<script type="application\/ld\+json" id="ld-news">[\s\S]*?<\/script>/;
  if (re.test(html)) {
    html = html.replace(re, block);
    console.log("✓ index.html の JSON-LD (ld-news) を更新");
  } else {
    console.warn("⚠ index.html に id=\"ld-news\" ブロックが見つからないため JSON-LD は未注入");
  }

  // Updated行（ヒーローの「Updated」表示）を最新化
  const updatedRe = /<span id="hero-updated">[\s\S]*?<\/span>/;
  if (updatedRe.test(html)) {
    html = html.replace(updatedRe, `<span id="hero-updated">${updatedLine}</span>`);
    console.log(`✓ index.html の Updated 行を更新（${updatedLine}）`);
  } else {
    console.warn("⚠ index.html に id=\"hero-updated\" が見つからないため Updated 行は未更新");
  }

  // 状況セクションの3カードを注入（§01「状況からブランディングを考える」）
  const cardsHtml = situations.items.map((s) => `      <a class="situation-card" href="situations/${esc(s.slug)}.html">
        <div class="sc-stage">Stage ${esc(s.num)} · ${esc(s.stage)}</div>
        <h3 class="sc-title">${esc(s.title)}</h3>
        <p class="sc-sub">${esc(s.subtitle)}</p>
        <div class="sc-go">この状況で考える →</div>
      </a>`).join("\n");
  // 注入はカードHTML内の入れ子 </div> に誤マッチしないよう、コメント番兵で囲んだ領域のみを置換する
  const cardsBlock = `<!-- SITUATIONS-CARDS:START -->\n    <div id="situations-cards">\n${cardsHtml}\n    </div>\n    <!-- SITUATIONS-CARDS:END -->`;
  const cardsRe = /<!-- SITUATIONS-CARDS:START -->[\s\S]*?<!-- SITUATIONS-CARDS:END -->/;
  if (cardsRe.test(html)) {
    html = html.replace(cardsRe, cardsBlock);
    console.log(`✓ index.html の 状況カード（${situations.items.length}枚）を更新`);
  } else {
    console.warn("⚠ index.html に SITUATIONS-CARDS マーカーが見つからないため 状況カードは未注入");
  }

  // 「ブランディング、まずはここから」5大疑問カードを注入（アイコン付きカード式）
  const basicsHtml = basics.items.map((b) => `      <a class="basic-card" href="basics/${esc(b.slug)}.html">
        <div class="bc-thumb"><img src="assets/basics/${esc(b.slug)}.svg" alt="" aria-hidden="true"><span class="bc-num">${esc(b.num)}</span></div>
        <div class="bc-body">
          <div class="bc-q">${esc(b.q)}</div>
          <div class="bc-teaser">${esc(b.teaser)}</div>
          <div class="bc-go">読む<span class="bc-arrow">→</span></div>
        </div>
      </a>`).join("\n");
  const basicsBlock = `<!-- BASICS-CARDS:START -->\n    <div id="basics-cards">\n${basicsHtml}\n    </div>\n    <!-- BASICS-CARDS:END -->`;
  const basicsRe = /<!-- BASICS-CARDS:START -->[\s\S]*?<!-- BASICS-CARDS:END -->/;
  if (basicsRe.test(html)) {
    html = html.replace(basicsRe, basicsBlock);
    console.log(`✓ index.html の 5大疑問カード（${basics.items.length}枚）を更新`);
  } else {
    console.warn("⚠ index.html に BASICS-CARDS マーカーが見つからないため 5大疑問カードは未注入");
  }

  writeFileSync(ldPath, html);
}

// ---------- generate news detail pages: project/news/<id>.html ----------
// 各ニュースをまず自社の詳細記事にし、その末尾から引用元へリンクさせる。
function renderNewsPage(n) {
  const url = `${BASE}/news/${n.id}.html`;
  const heading = n.headline || n.title;
  const dateFmt = (n.date || "").replace(/-/g, ".");
  const cover = n.thumb ? `../${n.thumb}` : "";

  // 記事ハーネス（大元の記事 branding.html 準拠）:
  //   lead → 番号付きセクション（見出し + 段落）→ 立場のプルクオート → …
  // セクション本文の <em> はそのまま通す（見出し・引用符は escape 済み）。
  let bodyHtml;
  if (Array.isArray(n.sections) && n.sections.length) {
    const parts = [];
    if (n.lead) parts.push(`      <p class="lead">${n.lead}</p>`);
    n.sections.forEach((s, i) => {
      const num = s.num || String(i + 1).padStart(2, "0");
      parts.push(`      <h2><span class="num">— ${esc(num)} —</span>${esc(s.h)}</h2>`);
      (Array.isArray(s.p) ? s.p : []).forEach((p) => parts.push(`      <p>${p}</p>`));
      // プルクオートは2つ目の見出しの後（セクションが少なければ最後）に差し込む
      if (n.pullquote && i === Math.min(1, n.sections.length - 1)) {
        parts.push(`      <div class="pullquote">${esc(n.pullquote)}<cite>— Brandri / Highlite editorial</cite></div>`);
      }
    });
    bodyHtml = parts.join("\n");
  } else if (Array.isArray(n.body) && n.body.length) {
    bodyHtml = n.body.map((p, i) => `      <p${i === 0 ? ' class="lead"' : ""}>${p}</p>`).join("\n");
  } else {
    bodyHtml = `      <p class="lead">${esc(n.insight || "")}</p>`;
  }
  const takeaways = (Array.isArray(n.takeaways) && n.takeaways.length)
    ? `      <div class="news-takeaways">
        <div class="tk-label">◆ 経営がここから判断すべきこと</div>
        <ul>
${n.takeaways.map((t) => `          <li>${esc(t)}</li>`).join("\n")}
        </ul>
      </div>`
    : "";

  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": heading,
    "datePublished": n.date,
    "dateModified": n.date,
    "inLanguage": "ja",
    "image": cover ? `${BASE}/${n.thumb}` : undefined,
    "author": { "@type": "Organization", "name": "Highlite Inc." },
    "publisher": { "@type": "Organization", "name": "Highlite Inc.", "logo": { "@type": "ImageObject", "url": `${BASE}/assets/logo.svg` } },
    "mainEntityOfPage": url,
    "isBasedOn": n.source.url,
    "citation": { "@type": "CreativeWork", "name": n.source.name, "url": n.source.url }
  };
  const ldCrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Brandri", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": "ニュース", "item": `${BASE}/#latest` },
      { "@type": "ListItem", "position": 3, "name": heading, "item": url }
    ]
  };
  const metaDesc = esc((n.insight || heading).slice(0, 120));

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(heading)} — Brandri</title>
<meta name="description" content="${metaDesc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Brandri">
<meta property="og:title" content="${esc(heading)}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:url" content="${url}">
${cover ? `<meta property="og:image" content="${BASE}/${n.thumb}">` : ""}
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify(ldArticle, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ldCrumb, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css?v=20260705">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="brand-lockup">
      <div class="brand-mark">Brandri<span class="dot">.</span></div>
      <div class="brand-sub">ここだけでわかるブランドの全て<span class="by">by Highlite</span></div>
    </a>
    <nav class="primary">
      <a href="../index.html#entries"><span class="num">01</span>探す</a>
      <a href="../index.html#philosophy"><span class="num">02</span>思想</a>
      <a href="../index.html#knowledge"><span class="num">03</span>ナレッジ</a>
      <a href="../index.html#cases"><span class="num">04</span>事例</a>
      <a href="../index.html#diagnostic"><span class="num">05</span>診断</a>
    </nav>
    <div class="header-cta">
      <button class="search-btn"><span>検索</span><kbd>⌘K</kbd></button>
    </div>
  </div>
</header>

<section class="news-hero">
  <div class="wrap">
    <div class="news-breadcrumb">
      <a href="../index.html">Brandri</a>
      <span class="sep">/</span>
      <a href="../index.html#latest">ニュース</a>
      <span class="sep">/</span>
      <span>${esc(n.cat)}</span>
    </div>
    <div class="news-cat"><span>News · ${esc(n.cat)}</span><span class="date">${esc(dateFmt)}</span></div>
    <h1 class="news-title">${esc(heading)}</h1>
    <p class="news-standfirst">${esc(n.insight || "")}</p>
  </div>
</section>

<div class="wrap">
  ${cover ? `<div class="news-cover" role="img" aria-label="${esc(heading)}のイメージ" style="background-image:url('${esc(cover)}')"></div>
  <div class="news-cover-cap">Illustration · Brandri 編集部（本記事のために生成した抽象イメージ）</div>` : ""}
</div>

<article class="news-article">
${bodyHtml}

${takeaways}

  <div class="news-source-box">
    <div class="src-label">▸ この解説は、次のニュースを起点にしています</div>
    <div class="src-title">${esc(n.title)}</div>
    <div class="src-name">${esc(n.source.name)}</div>
    <a class="src-link" href="${esc(n.source.url)}" target="_blank" rel="noopener nofollow">元記事を読む（外部サイト）→</a>
  </div>

  <div class="news-cta">
    <p class="cta-note">自社のブランドは、この論点にどう答えられているか。5問・2分のブランド診断で現在地を測れます。</p>
    <a class="btn" href="../index.html#diagnostic">ブランド診断を受ける →</a>
    <a class="btn ghost" href="../index.html#contact">無料相談を申し込む</a>
  </div>
</article>

<div class="news-back">
  <div class="wrap"><a href="../index.html#latest">← ニュース一覧へ戻る</a></div>
</div>

<footer>
  <div class="wrap">
    <div>
      <div class="foot-brand">Brandri<span class="dot">.</span></div>
      <div class="foot-tag">ここだけでわかるブランドの全て。<br>Highliteが編集する、経営のためのブランド知識インフラ。</div>
    </div>
    <div>
      <h5>Browse</h5>
      <ul>
        <li><a href="../index.html#entries">課題から探す</a></li>
        <li><a href="../index.html#entries">フェーズから探す</a></li>
        <li><a href="../glossary.html">用語集</a></li>
        <li><a href="../branding.html">ブランディングとは</a></li>
      </ul>
    </div>
    <div>
      <h5>Highlite</h5>
      <ul>
        <li><a href="../index.html#services">提供サービス</a></li>
        <li><a href="../index.html#cases">事例</a></li>
        <li><a href="../index.html#diagnostic">ブランド診断</a></li>
      </ul>
    </div>
    <div>
      <h5>Contact</h5>
      <ul>
        <li><a href="../index.html#contact">無料相談</a></li>
        <li><a href="../index.html#contact">資料請求</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Highlite Inc.</span>
    <span>Brandri Vol.01 / Spring 2026</span>
  </div>
</footer>

</body>
</html>
`;
}

// ---------- generate article detail pages: project/articles/<slug>.html ----------
// 読み物（articles.json）のうち slug + sections を持つものを、本文ページ化する。
// 既存の legacy 記事（slug なし）は従来どおり knowledge.html のアンカー表示のまま。
const ARTICLE_CTA_NOTE = "自社のブランドは、この論点にどう答えられているか。5問・約2分のブランドチェックで、現在地を確かめられます。";
function renderArticlePage(a) {
  const url = `${BASE}/articles/${a.slug}.html`;
  const heading = a.title;
  const dateFmt = String(a.date || "").replace(/-/g, ".");

  const parts = [];
  if (a.lead) parts.push(`      <p class="lead">${a.lead}</p>`);
  (a.sections || []).forEach((s, i) => {
    const num = s.num || String(i + 1).padStart(2, "0");
    parts.push(`      <h2><span class="num">— ${esc(num)} —</span>${esc(s.h)}</h2>`);
    (Array.isArray(s.p) ? s.p : []).forEach((p) => parts.push(`      <p>${p}</p>`));
    if (a.pullquote && i === Math.min(1, (a.sections || []).length - 1)) {
      parts.push(`      <div class="pullquote">${esc(a.pullquote)}<cite>— Brandri / Highlite editorial</cite></div>`);
    }
  });
  const bodyHtml = parts.join("\n");

  const takeaways = (Array.isArray(a.takeaways) && a.takeaways.length)
    ? `      <div class="news-takeaways">
        <div class="tk-label">◆ 経営がここから判断すべきこと</div>
        <ul>
${a.takeaways.map((t) => `          <li>${esc(t)}</li>`).join("\n")}
        </ul>
      </div>`
    : "";

  const related = (Array.isArray(a.related) && a.related.length)
    ? `      <div class="article-related">
        <div class="ar-label">▸ あわせて読む・次の一歩</div>
        <ul>
${a.related.map((r) => `          <li><a href="../${esc(r.href)}">${esc(r.t)} →</a></li>`).join("\n")}
        </ul>
      </div>`
    : "";

  const sourcesBox = (Array.isArray(a.sources) && a.sources.length)
    ? `      <div class="news-source-box article-sources">
        <div class="src-label">▸ 参考・引用</div>
${a.sources.map((s) => `        <div class="src-cite">${esc(s.author)}${s.year ? `（${s.year}）` : ""} <em>${esc(s.title)}</em></div>`).join("\n")}
      </div>`
    : "";

  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": heading,
    "datePublished": normDate(a.date),
    "dateModified": normDate(a.date),
    "inLanguage": "ja",
    "articleSection": a.cat,
    "keywords": a.keyword || undefined,
    "author": { "@type": "Organization", "name": "Highlite Inc." },
    "publisher": { "@type": "Organization", "name": "Highlite Inc.", "logo": { "@type": "ImageObject", "url": `${BASE}/assets/logo.svg` } },
    "mainEntityOfPage": url
  };
  const ldCrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Brandri", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": "読み物", "item": `${BASE}/knowledge.html` },
      { "@type": "ListItem", "position": 3, "name": heading, "item": url }
    ]
  };
  const metaDesc = esc(String(a.lead || heading).replace(/<[^>]+>/g, "").slice(0, 120));

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(heading)} — Brandri</title>
<meta name="description" content="${metaDesc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Brandri">
<meta property="og:title" content="${esc(heading)}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify(ldArticle, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ldCrumb, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css?v=${CSS_VER}">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="brand-lockup">
      <div class="brand-mark">Brandri<span class="dot">.</span></div>
      <div class="brand-sub">ここだけでわかるブランドの全て<span class="by">by Highlite</span></div>
    </a>
    <nav class="primary">
      <a href="../index.html#basics"><span class="num">00</span>ここから</a>
      <a href="../index.html#situations"><span class="num">01</span>探す</a>
      <a href="../index.html#philosophy"><span class="num">02</span>思想</a>
      <a href="../index.html#knowledge"><span class="num">03</span>ナレッジ</a>
      <a href="../index.html#diagnostic"><span class="num">05</span>診断</a>
    </nav>
    <div class="header-cta">
      <button class="search-btn"><span>検索</span><kbd>⌘K</kbd></button>
    </div>
  </div>
</header>

<section class="news-hero">
  <div class="wrap">
    <div class="news-breadcrumb">
      <a href="../index.html">Brandri</a>
      <span class="sep">/</span>
      <a href="../knowledge.html">読み物</a>
      <span class="sep">/</span>
      <span>${esc(a.cat)}</span>
    </div>
    <div class="news-cat"><span>読み物 · ${esc(a.cat)}</span><span class="date">${esc(dateFmt)}</span></div>
    <h1 class="news-title">${esc(heading)}</h1>
    <p class="news-standfirst">${esc(String(a.lead || "").replace(/<[^>]+>/g, ""))}</p>
  </div>
</section>

<article class="news-article">
${bodyHtml}

${takeaways}

${related}

${sourcesBox}

  <div class="news-cta">
    <p class="cta-note">${ARTICLE_CTA_NOTE}</p>
    <a class="btn" href="../index.html#diagnostic">ブランドチェックを受ける →</a>
    <a class="btn ghost" href="../index.html#contact">無料相談を申し込む</a>
  </div>
</article>

<div class="news-back">
  <div class="wrap"><a href="../knowledge.html">← 読み物一覧へ戻る</a></div>
</div>

<footer>
  <div class="wrap">
    <div>
      <div class="foot-brand">Brandri<span class="dot">.</span></div>
      <div class="foot-tag">ここだけでわかるブランドの全て。<br>Highliteが編集する、経営のためのブランド知識インフラ。</div>
    </div>
    <div>
      <h5>Browse</h5>
      <ul>
        <li><a href="../index.html#basics">まずはここから（5大疑問）</a></li>
        <li><a href="../index.html#situations">状況から探す</a></li>
        <li><a href="../index.html#entries">課題・フェーズ・用語から探す</a></li>
        <li><a href="../knowledge.html">読み物</a></li>
      </ul>
    </div>
    <div>
      <h5>Highlite</h5>
      <ul>
        <li><a href="../index.html#services">提供サービス</a></li>
        <li><a href="../index.html#cases">事例</a></li>
        <li><a href="../index.html#diagnostic">ブランドチェック</a></li>
      </ul>
    </div>
    <div>
      <h5>Contact</h5>
      <ul>
        <li><a href="../index.html#contact">無料相談</a></li>
        <li><a href="../index.html#contact">資料請求</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Highlite Inc.</span>
    <span>Brandri Vol.01 / Spring 2026</span>
  </div>
</footer>

</body>
</html>
`;
}

const articleDir = P("project/articles");
mkdirSync(articleDir, { recursive: true });
const articlePagesList = articles.items.filter((a) => a.slug && Array.isArray(a.sections) && a.sections.length);
const wantArticleFiles = new Set(articlePagesList.map((a) => `${a.slug}.html`));
articlePagesList.forEach((a) => writeFileSync(resolve(articleDir, `${a.slug}.html`), renderArticlePage(a)));
let removedArticles = 0;
for (const f of readdirSync(articleDir)) {
  if (f.endsWith(".html") && !wantArticleFiles.has(f)) { unlinkSync(resolve(articleDir, f)); removedArticles++; }
}
console.log(`✓ articles/*.html を生成（${articlePagesList.length}本${removedArticles ? ` / 旧${removedArticles}本を削除` : ""}）`);

const newsDir = P("project/news");
mkdirSync(newsDir, { recursive: true });
const wantFiles = new Set(newsSorted.map((n) => `${n.id}.html`));
// 生成
newsSorted.forEach((n) => writeFileSync(resolve(newsDir, `${n.id}.html`), renderNewsPage(n)));
// 保持数を超えて消えたニュースの古いページを掃除
let removed = 0;
for (const f of readdirSync(newsDir)) {
  if (f.endsWith(".html") && !wantFiles.has(f)) { unlinkSync(resolve(newsDir, f)); removed++; }
}
console.log(`✓ news/*.html を生成（${newsSorted.length}本${removed ? ` / 旧${removed}本を削除` : ""}）`);

// ---------- generate entry detail pages: project/entries/<type>-<slug>.html ----------
// §01「三つの入口」の各項目（課題/フェーズ/用語）の詳細。
// 必須4章: ブランドのナレッジ / 課題解決方法例 / 他社事例 / Highliteの観点
const ENTRY_LABEL = { issue: "課題", phase: "フェーズ", term: "用語" };
const ENTRY_EN = { issue: "Issue", phase: "Phase", term: "Term" };

function renderEntryPage(e) {
  const file = entryHref(e); // entries/<type>-<slug>.html
  const url = `${BASE}/${file}`;
  const label = ENTRY_LABEL[e.type];
  const numLabel = e.type === "term" ? `— ${e.num} —` : `№ ${e.num}`;

  const knowledgeSources = (e.knowledge.sources && e.knowledge.sources.length)
    ? `      <div class="k-sources">Sources · ${e.knowledge.sources.map((s) => `${esc(s.author)} (${s.year || "—"}) <em>${esc(s.title)}</em>`).join(" ／ ")}</div>`
    : "";

  const solutionTitle = e.type === "issue" ? "解決アプローチ — 課題解決方法例"
    : e.type === "phase" ? "この時期の動き方 — 課題解決方法例"
    : "実務での使い方 — 課題解決方法例";

  const stepsHtml = e.solutions.steps.map((s, i) => `          <li><strong>${String(i + 1).padStart(2, "0")}．${esc(s.t)}</strong>${esc(s.d)}</li>`).join("\n");

  const worksHtml = e.cases.works.map((c) => `  <div class="news-source-box">
    <div class="src-label">▸ Highlite Works</div>
    <div class="src-title">${esc(c.client)}</div>
    <div class="src-name">${esc(c.point)}</div>
    <a class="src-link" href="${esc(c.url)}" target="_blank" rel="noopener">実績の詳細を見る（Highlite公式）→</a>
  </div>`).join("\n");

  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": e.title,
    "description": e.lead,
    "inLanguage": "ja",
    "author": { "@type": "Organization", "name": "Highlite Inc." },
    "publisher": { "@type": "Organization", "name": "Highlite Inc.", "logo": { "@type": "ImageObject", "url": `${BASE}/assets/logo.svg` } },
    "mainEntityOfPage": url
  };
  const ldCrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Brandri", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": `${label}から探す`, "item": `${BASE}/#entries` },
      { "@type": "ListItem", "position": 3, "name": e.title, "item": url }
    ]
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(e.title)}｜${label}から探す — Brandri</title>
<meta name="description" content="${esc(e.lead.slice(0, 120))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Brandri">
<meta property="og:title" content="${esc(e.title)} — Brandri">
<meta property="og:description" content="${esc(e.lead.slice(0, 120))}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ldCrumb, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css?v=20260705">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="brand-lockup">
      <div class="brand-mark">Brandri<span class="dot">.</span></div>
      <div class="brand-sub">ここだけでわかるブランドの全て<span class="by">by Highlite</span></div>
    </a>
    <nav class="primary">
      <a href="../index.html#entries"><span class="num">01</span>探す</a>
      <a href="../index.html#philosophy"><span class="num">02</span>思想</a>
      <a href="../index.html#knowledge"><span class="num">03</span>ナレッジ</a>
      <a href="../index.html#cases"><span class="num">04</span>事例</a>
      <a href="../index.html#diagnostic"><span class="num">05</span>診断</a>
    </nav>
    <div class="header-cta">
      <button class="search-btn"><span>検索</span><kbd>⌘K</kbd></button>
    </div>
  </div>
</header>

<section class="news-hero">
  <div class="wrap">
    <div class="news-breadcrumb">
      <a href="../index.html">Brandri</a>
      <span class="sep">/</span>
      <a href="../index.html#entries">${label}から探す</a>
      <span class="sep">/</span>
      <span>${esc(e.title)}</span>
    </div>
    <div class="news-cat"><span>${ENTRY_EN[e.type]} · ${esc(numLabel)}</span><span class="date">${esc(e.desc)}</span></div>
    <h1 class="news-title">${esc(e.title)}</h1>
    <p class="news-standfirst">${esc(e.lead)}</p>
  </div>
</section>

<article class="news-article">
      <h2><span class="num">— 01 —</span>ブランドのナレッジ</h2>
${e.knowledge.paras.map((p) => `      <p>${p}</p>`).join("\n")}
${knowledgeSources}

      <h2><span class="num">— 02 —</span>${esc(solutionTitle)}</h2>
      <div class="news-takeaways entry-steps">
        <div class="tk-label">◆ 実務の進め方</div>
        <ul>
${stepsHtml}
        </ul>
      </div>

      <h2><span class="num">— 03 —</span>他社事例</h2>
      <p>${esc(e.cases.note)}</p>
${worksHtml}
${e.cases.public ? `      <p>${esc(e.cases.public)}</p>` : ""}

      <h2><span class="num">— 04 —</span>Highliteの観点</h2>
${e.highlite.view.map((p) => `      <p>${p}</p>`).join("\n")}
      <div class="pullquote">${esc(e.highlite.pull)}<cite>— Brandri / Highlite editorial</cite></div>

  <div class="news-cta">
    <p class="cta-note">自社はこの論点にどう答えられているか。5問・2分のブランド診断で現在地を測れます。</p>
    <a class="btn" href="../index.html#diagnostic">ブランド診断を受ける →</a>
    <a class="btn ghost" href="../index.html#contact">無料相談を申し込む</a>
  </div>
</article>

<div class="news-back">
  <div class="wrap"><a href="../index.html#entries">← 三つの入口へ戻る</a></div>
</div>

<footer>
  <div class="wrap">
    <div>
      <div class="foot-brand">Brandri<span class="dot">.</span></div>
      <div class="foot-tag">ここだけでわかるブランドの全て。<br>Highliteが編集する、経営のためのブランド知識インフラ。</div>
    </div>
    <div>
      <h5>Browse</h5>
      <ul>
        <li><a href="../index.html#entries">課題から探す</a></li>
        <li><a href="../index.html#entries">フェーズから探す</a></li>
        <li><a href="../glossary.html">用語集</a></li>
        <li><a href="../branding.html">ブランディングとは</a></li>
      </ul>
    </div>
    <div>
      <h5>Highlite</h5>
      <ul>
        <li><a href="../index.html#services">提供サービス</a></li>
        <li><a href="../index.html#cases">事例</a></li>
        <li><a href="../index.html#diagnostic">ブランド診断</a></li>
      </ul>
    </div>
    <div>
      <h5>Contact</h5>
      <ul>
        <li><a href="../index.html#contact">無料相談</a></li>
        <li><a href="../index.html#contact">資料請求</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Highlite Inc.</span>
    <span>Brandri Vol.01 / Spring 2026</span>
  </div>
</footer>

</body>
</html>
`;
}

const entriesDir = P("project/entries");
mkdirSync(entriesDir, { recursive: true });
const wantEntryFiles = new Set(entries.items.map((e) => `${e.type}-${e.slug}.html`));
entries.items.forEach((e) => writeFileSync(resolve(entriesDir, `${e.type}-${e.slug}.html`), renderEntryPage(e)));
let removedEntries = 0;
for (const f of readdirSync(entriesDir)) {
  if (f.endsWith(".html") && !wantEntryFiles.has(f)) { unlinkSync(resolve(entriesDir, f)); removedEntries++; }
}
console.log(`✓ entries/*.html を生成（${entries.items.length}本${removedEntries ? ` / 旧${removedEntries}本を削除` : ""}）`);

// ---------- generate situation landing pages: project/situations/<slug>.html ----------
// §01「状況からブランディングを考える」: 成長ステージ別に、既存の入口ページと読み物を束ねるハブ。
const entryBySlug = new Map(entries.items.map((e) => [`${e.type}-${e.slug}`, e]));
const articleByNum = new Map(articles.items.map((a) => [String(a.num), a]));
const ENTRY_GROUP = [
  { type: "issue", label: "課題から" },
  { type: "phase", label: "フェーズから" },
  { type: "term", label: "用語から" },
];

function renderSituationPage(s) {
  const url = `${BASE}/situations/${s.slug}.html`;

  // 押さえる論点: entries を 課題/フェーズ/用語 で束ねてカード化（実在の入口ページへリンク）
  const linkGroups = ENTRY_GROUP.map((g) => {
    const items = s.entries.map((ref) => entryBySlug.get(ref)).filter((e) => e && e.type === g.type);
    if (!items.length) return "";
    const cards = items.map((e) => {
      const numLabel = e.type === "term" ? `— ${e.num} —` : `№ ${e.num}`;
      return `        <a class="sit-link" href="../entries/${e.type}-${esc(e.slug)}.html">
          <span class="sl-num">${esc(numLabel)}</span>
          <span class="sl-title">${esc(e.title)}</span>
          <span class="sl-desc">${esc(e.desc)}</span>
        </a>`;
    }).join("\n");
    return `      <div class="sit-group">
        <div class="sit-group-label">${esc(g.label)}</div>
        <div class="sit-links">
${cards}
        </div>
      </div>`;
  }).filter(Boolean).join("\n");

  // あわせて読みたい（読み物カード → knowledge.html のアンカーへ）
  const readItems = (s.reading || []).map((num) => articleByNum.get(String(num))).filter(Boolean);
  const readingHtml = readItems.length ? `
      <h2><span class="num">— 03 —</span>あわせて読みたい</h2>
      <div class="sit-links sit-reading">
${readItems.map((a) => `        <a class="sit-link" href="../knowledge.html#a${esc(a.num)}">
          <span class="sl-num">${esc(a.cat)}</span>
          <span class="sl-title">${esc(a.title)}</span>
        </a>`).join("\n")}
      </div>` : "";

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${s.title}｜状況からブランディングを考える`,
    "description": s.lead,
    "inLanguage": "ja",
    "isPartOf": { "@type": "WebSite", "name": "Brandri", "url": `${BASE}/` },
    "url": url
  };
  const ldCrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Brandri", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": "状況から考える", "item": `${BASE}/#situations` },
      { "@type": "ListItem", "position": 3, "name": s.title, "item": url }
    ]
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.title)}｜状況からブランディングを考える — Brandri</title>
<meta name="description" content="${esc(s.lead.slice(0, 120))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Brandri">
<meta property="og:title" content="${esc(s.title)} — Brandri">
<meta property="og:description" content="${esc(s.lead.slice(0, 120))}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ldCrumb, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css?v=20260705e">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="brand-lockup">
      <div class="brand-mark">Brandri<span class="dot">.</span></div>
      <div class="brand-sub">ここだけでわかるブランドの全て<span class="by">by Highlite</span></div>
    </a>
    <nav class="primary">
      <a href="../index.html#situations"><span class="num">01</span>探す</a>
      <a href="../index.html#philosophy"><span class="num">02</span>思想</a>
      <a href="../index.html#knowledge"><span class="num">03</span>ナレッジ</a>
      <a href="../index.html#cases"><span class="num">04</span>事例</a>
      <a href="../index.html#diagnostic"><span class="num">05</span>診断</a>
    </nav>
    <div class="header-cta">
      <button class="search-btn"><span>検索</span><kbd>⌘K</kbd></button>
    </div>
  </div>
</header>

<section class="news-hero">
  <div class="wrap">
    <div class="news-breadcrumb">
      <a href="../index.html">Brandri</a>
      <span class="sep">/</span>
      <a href="../index.html#situations">状況から考える</a>
      <span class="sep">/</span>
      <span>${esc(s.title)}</span>
    </div>
    <div class="news-cat"><span>Stage ${esc(s.num)} · ${esc(s.stage)}</span><span class="date">${esc(s.subtitle)}</span></div>
    <h1 class="news-title">${esc(s.title)}</h1>
    <p class="news-standfirst">${esc(s.lead)}</p>
  </div>
</section>

<article class="news-article">
      <h2><span class="num">— 01 —</span>Highliteの視点</h2>
${s.framing.map((p) => `      <p>${p}</p>`).join("\n")}
      <div class="pullquote">${esc(s.pull)}<cite>— Brandri / Highlite editorial</cite></div>

      <h2><span class="num">— 02 —</span>この状況で押さえる論点</h2>
      <p>あなたの状況に直結する入口を、課題・フェーズ・用語から束ねました。それぞれの詳細で、ナレッジ・解決アプローチ・他社事例・Highliteの観点まで辿れます。</p>
${linkGroups}
${readingHtml}

  <div class="news-cta">
    <p class="cta-note">今の状況で、自社のブランドはどこまで答えられているか。5問・2分のブランド診断で現在地を測れます。</p>
    <a class="btn" href="../index.html#diagnostic">ブランド診断を受ける →</a>
    <a class="btn ghost" href="../index.html#contact">無料相談を申し込む</a>
  </div>
</article>

<div class="news-back">
  <div class="wrap"><a href="../index.html#situations">← 状況から考える に戻る</a></div>
</div>

<footer>
  <div class="wrap">
    <div>
      <div class="foot-brand">Brandri<span class="dot">.</span></div>
      <div class="foot-tag">ここだけでわかるブランドの全て。<br>Highliteが編集する、経営のためのブランド知識インフラ。</div>
    </div>
    <div>
      <h5>Browse</h5>
      <ul>
        <li><a href="../index.html#situations">状況から探す</a></li>
        <li><a href="../index.html#entries">課題・フェーズ・用語から探す</a></li>
        <li><a href="../glossary.html">用語集</a></li>
        <li><a href="../branding.html">ブランディングとは</a></li>
      </ul>
    </div>
    <div>
      <h5>Highlite</h5>
      <ul>
        <li><a href="../index.html#services">提供サービス</a></li>
        <li><a href="../index.html#cases">事例</a></li>
        <li><a href="../index.html#diagnostic">ブランド診断</a></li>
      </ul>
    </div>
    <div>
      <h5>Contact</h5>
      <ul>
        <li><a href="../index.html#contact">無料相談</a></li>
        <li><a href="../index.html#contact">資料請求</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Highlite Inc.</span>
    <span>Brandri Vol.01 / Spring 2026</span>
  </div>
</footer>

</body>
</html>
`;
}

const situationsDir = P("project/situations");
mkdirSync(situationsDir, { recursive: true });
const wantSituationFiles = new Set(situations.items.map((s) => `${s.slug}.html`));
situations.items.forEach((s) => writeFileSync(resolve(situationsDir, `${s.slug}.html`), renderSituationPage(s)));
let removedSituations = 0;
for (const f of readdirSync(situationsDir)) {
  if (f.endsWith(".html") && !wantSituationFiles.has(f)) { unlinkSync(resolve(situationsDir, f)); removedSituations++; }
}
console.log(`✓ situations/*.html を生成（${situations.items.length}本${removedSituations ? ` / 旧${removedSituations}本を削除` : ""}）`);

// ---------- generate basics pages: project/basics/<slug>.html ----------
// 「ブランディング、まずはここから」5大疑問の初心者向け解説。末尾からブランドチェックへ送る。
function renderBasicPage(b, idx) {
  const url = `${BASE}/basics/${b.slug}.html`;
  const prev = idx > 0 ? basics.items[idx - 1] : null;
  const next = idx < basics.items.length - 1 ? basics.items[idx + 1] : null;
  const entryByFull = new Map(entries.items.map((e) => [`${e.type}-${e.slug}`, e]));

  // 読了目安（本文＋lead の文字数から / 約500字/分）
  const bodyChars = (b.sections || []).reduce((n, s) => n + (s.p || []).join("").replace(/<[^>]+>/g, "").length, 0)
    + String(b.lead || "").replace(/<[^>]+>/g, "").length;
  const readMin = Math.max(2, Math.round(bodyChars / 500));

  // 図解 figure（差し替え可能・16:9）
  const figHtml = (f) => f ? `      <figure class="basics-figure" id="${esc(f.id)}">
        <div class="bf-frame"><img src="../${esc(f.src)}" alt="${esc(f.alt || "")}" loading="lazy"></div>
        <figcaption>${esc(f.caption || "")}</figcaption>
      </figure>` : "";
  const fig1 = (b.figures || [])[0];
  const fig2 = (b.figures || [])[1];

  // 本文（節番号付き）。2節目の後に pullquote、3節目の後に fig2 を差し込む。
  const bodyParts = [];
  (b.sections || []).forEach((s, i) => {
    const num = `— ${String(i + 1).padStart(2, "0")} —`;
    bodyParts.push(`      <h2 id="sec-${i + 1}"><span class="num">${num}</span>${esc(s.h)}</h2>`);
    (s.p || []).forEach((p) => bodyParts.push(`      <p>${p}</p>`));
    if (b.pull && i === Math.min(1, (b.sections || []).length - 1)) {
      bodyParts.push(`      <div class="pullquote">${esc(b.pull)}<cite>— Brandri / Highlite editorial</cite></div>`);
    }
    if (fig2 && i === 2) bodyParts.push(figHtml(fig2));
  });
  const bodyHtml = bodyParts.join("\n");

  // 30秒サマリー
  const answerHtml = b.answer ? `    <section class="answer-card reveal" id="answer">
      <div class="ac-label">Answer · 30秒でわかる</div>
      <p class="ac-one">${esc(b.answer.one)}</p>
      <ul class="ac-points">
${(b.answer.points || []).map((p) => `        <li>${esc(p)}</li>`).join("\n")}
      </ul>
    </section>` : "";

  // ページ内目次
  const toc = [
    b.answer ? { href: "#answer", t: "30秒の答え" } : null,
    fig1 ? { href: "#fig1", t: "図解で見る" } : null,
    { href: "#read", t: "じっくり読む" },
    (b.tabs && b.tabs.items && b.tabs.items.length) ? { href: "#tabs", t: b.tabs.label || "視点を変える" } : null,
    (b.faq && b.faq.length) ? { href: "#faq", t: "よくある誤解" } : null,
  ].filter(Boolean);
  const tocHtml = `    <nav class="basics-toc" aria-label="このページの目次">
${toc.map((t) => `      <a href="${t.href}">${esc(t.t)}</a>`).join("\n")}
    </nav>`;

  // タブ（JSオフでも全パネル閲覧可のプログレッシブエンハンスメント）
  const tabsHtml = (b.tabs && b.tabs.items && b.tabs.items.length) ? `    <section class="basics-tabs reveal" id="tabs">
      <div class="bt-head"><span class="bt-kicker">視点を切り替えて見る</span><h2>${esc(b.tabs.label || "")}</h2></div>
      <div class="tabset" data-tabs>
        <div class="tablist" role="tablist">
${b.tabs.items.map((t, j) => `          <button class="tab${j === 0 ? " is-on" : ""}" role="tab" data-i="${j}" aria-selected="${j === 0 ? "true" : "false"}">${esc(t.tab)}</button>`).join("\n")}
        </div>
        <div class="tabpanels">
${b.tabs.items.map((t, j) => `          <div class="tabpanel${j === 0 ? " is-on" : ""}" role="tabpanel" data-i="${j}">
            <h3>${esc(t.h)}</h3>
${(Array.isArray(t.p) ? t.p : [t.p]).map((p) => `            <p>${p}</p>`).join("\n")}
          </div>`).join("\n")}
        </div>
      </div>
    </section>` : "";

  // アコーディオンQ&A（native details / JS不要）
  const faqHtml = (b.faq && b.faq.length) ? `    <section class="basics-faq reveal" id="faq">
      <div class="bt-head"><span class="bt-kicker">Q&amp;A</span><h2>よくある誤解に、先に答えます</h2></div>
      <div class="faq-list">
${b.faq.map((f) => `        <details class="faq-item">
          <summary>${esc(f.q)}</summary>
          <div class="faq-a"><p>${esc(f.a)}</p></div>
        </details>`).join("\n")}
    </div>
    </section>` : "";

  // 用語チップ
  const termChips = (b.terms || []).map((ref) => {
    const e = entryByFull.get(ref);
    if (!e) return "";
    return `      <a class="term-chip" href="../${entryHref(e)}"><span class="tc-k">用語</span>${esc(e.title)}<span class="tc-go">→</span></a>`;
  }).filter(Boolean).join("\n");
  const termsHtml = termChips ? `    <section class="basics-terms reveal">
      <div class="bt-kicker">この疑問に関わる用語</div>
      <div class="term-chips">
${termChips}
      </div>
    </section>` : "";

  // 前後ナビ + ドット
  const dots = basics.items.map((x, i) => `<a class="bn-dot${i === idx ? " is-on" : ""}" href="${esc(x.slug)}.html" aria-label="疑問 ${esc(x.num)}"></a>`).join("");
  const prevCard = prev
    ? `<a class="bn-card prev" href="${esc(prev.slug)}.html"><span class="bn-dir">← 前の疑問 · ${esc(prev.num)}</span><span class="bn-q">${esc(prev.q)}</span></a>`
    : `<span class="bn-card ghost"></span>`;
  const nextCard = next
    ? `<a class="bn-card next" href="${esc(next.slug)}.html"><span class="bn-dir">次の疑問 · ${esc(next.num)} →</span><span class="bn-q">${esc(next.q)}</span></a>`
    : `<a class="bn-card next go-check" href="../index.html#diagnostic"><span class="bn-dir">5つの疑問は、ここまで →</span><span class="bn-q">さっそく自社をチェックする</span></a>`;

  const ld = {
    "@context": "https://schema.org", "@type": "Article",
    "headline": b.q, "description": b.lead, "inLanguage": "ja",
    "author": { "@type": "Organization", "name": "Highlite Inc." },
    "publisher": { "@type": "Organization", "name": "Highlite Inc.", "logo": { "@type": "ImageObject", "url": `${BASE}/assets/logo.svg` } },
    "mainEntityOfPage": url
  };
  const ldCrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Brandri", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": "ブランディング、まずはここから", "item": `${BASE}/#basics` },
      { "@type": "ListItem", "position": 3, "name": b.q, "item": url }
    ]
  };
  const ldFaq = (b.faq && b.faq.length) ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    "mainEntity": b.faq.map((f) => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }))
  } : null;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(b.q)}｜ブランディング、まずはここから — Brandri</title>
<meta name="description" content="${esc(b.lead.slice(0, 120))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Brandri">
<meta property="og:title" content="${esc(b.q)} — Brandri">
<meta property="og:description" content="${esc(b.lead.slice(0, 120))}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ldCrumb, null, 2)}
</script>${ldFaq ? `
<script type="application/ld+json">
${JSON.stringify(ldFaq, null, 2)}
</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css?v=${CSS_VER}">
</head>
<body class="basics-page">

<div class="reading-progress" id="reading-progress"></div>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="brand-lockup">
      <div class="brand-mark">Brandri<span class="dot">.</span></div>
      <div class="brand-sub">ここだけでわかるブランドの全て<span class="by">by Highlite</span></div>
    </a>
    <nav class="primary">
      <a href="../index.html#basics"><span class="num">00</span>ここから</a>
      <a href="../index.html#situations"><span class="num">01</span>探す</a>
      <a href="../index.html#philosophy"><span class="num">02</span>思想</a>
      <a href="../index.html#knowledge"><span class="num">03</span>ナレッジ</a>
      <a href="../index.html#diagnostic"><span class="num">05</span>診断</a>
    </nav>
    <div class="header-cta">
      <button class="search-btn"><span>検索</span><kbd>⌘K</kbd></button>
    </div>
  </div>
</header>

<section class="news-hero basics-hero">
  <div class="wrap">
    <div class="news-breadcrumb">
      <a href="../index.html">Brandri</a>
      <span class="sep">/</span>
      <a href="../index.html#basics">まずはここから</a>
      <span class="sep">/</span>
      <span>疑問 ${esc(b.num)}</span>
    </div>
    <div class="news-cat"><span>ブランディングの5大疑問 · ${esc(b.num)} / 05</span><span class="date">${readMin} min read</span></div>
    <div class="basics-hero-row">
      <img class="basics-hero-icon" src="../assets/basics/${esc(b.slug)}.svg" alt="" aria-hidden="true">
      <div>
        <h1 class="news-title">${esc(b.q)}</h1>
        <p class="news-standfirst">${esc(b.lead)}</p>
      </div>
    </div>
  </div>
</section>

<div class="basics-layout wrap">
${tocHtml}
  <div class="basics-main">
${answerHtml}
${fig1 ? figHtml(fig1) : ""}

    <article class="news-article basics-article" id="read">
${bodyHtml}
    </article>

${tabsHtml}

${faqHtml}

${termsHtml}

    <div class="news-cta basics-cta">
      <p class="cta-note"><strong>ここまで読んだあなたへ。</strong>知識は、使って初めて力になります。まずは5問・約2分のブランドチェックで、自社の“現在地”を確かめてみてください。</p>
      <a class="btn" href="../index.html#diagnostic">ブランドチェックを受ける →</a>
      <a class="btn ghost" href="../index.html#contact">プロに相談する</a>
    </div>
  </div>
</div>

<nav class="basics-nav" aria-label="5大疑問のページ送り">
  <div class="wrap">
    <div class="bn-cards">
      ${prevCard}
      ${nextCard}
    </div>
    <div class="bn-dots">${dots}</div>
  </div>
</nav>

<footer>
  <div class="wrap">
    <div>
      <div class="foot-brand">Brandri<span class="dot">.</span></div>
      <div class="foot-tag">ここだけでわかるブランドの全て。<br>Highliteが編集する、経営のためのブランド知識インフラ。</div>
    </div>
    <div>
      <h5>Browse</h5>
      <ul>
        <li><a href="../index.html#basics">まずはここから（5大疑問）</a></li>
        <li><a href="../index.html#situations">状況から探す</a></li>
        <li><a href="../index.html#entries">課題・フェーズ・用語から探す</a></li>
        <li><a href="../knowledge.html">読み物</a></li>
      </ul>
    </div>
    <div>
      <h5>Highlite</h5>
      <ul>
        <li><a href="../index.html#services">提供サービス</a></li>
        <li><a href="../index.html#cases">事例</a></li>
        <li><a href="../index.html#diagnostic">ブランドチェック</a></li>
      </ul>
    </div>
    <div>
      <h5>Contact</h5>
      <ul>
        <li><a href="../index.html#contact">無料相談</a></li>
        <li><a href="../index.html#contact">資料請求</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Highlite Inc.</span>
    <span>Brandri Vol.01 / Spring 2026</span>
  </div>
</footer>

<script src="../js/basics.js?v=${CSS_VER}"></script>
</body>
</html>
`;
}

const basicsDir = P("project/basics");
mkdirSync(basicsDir, { recursive: true });
const wantBasicsFiles = new Set(basics.items.map((b) => `${b.slug}.html`));
basics.items.forEach((b, i) => writeFileSync(resolve(basicsDir, `${b.slug}.html`), renderBasicPage(b, i)));
let removedBasics = 0;
for (const f of readdirSync(basicsDir)) {
  if (f.endsWith(".html") && !wantBasicsFiles.has(f)) { unlinkSync(resolve(basicsDir, f)); removedBasics++; }
}
console.log(`✓ basics/*.html を生成（${basics.items.length}本${removedBasics ? ` / 旧${removedBasics}本を削除` : ""}）`);

// ---------- regenerate sitemap.xml (固定ページ + ニュース詳細) ----------
const staticPages = [
  { loc: `${BASE}/`, changefreq: "daily", priority: "1.0" },
  { loc: `${BASE}/start.html`, changefreq: "monthly", priority: "0.8" },
  { loc: `${BASE}/knowledge.html`, changefreq: "weekly", priority: "0.9" },
  { loc: `${BASE}/branding.html`, changefreq: "monthly", priority: "0.8" },
  { loc: `${BASE}/glossary.html`, changefreq: "monthly", priority: "0.7" }
];
const newsPages = newsSorted.map((n) => ({
  loc: `${BASE}/news/${n.id}.html`, lastmod: n.date, changefreq: "monthly", priority: "0.6"
}));
const basicsPages = basics.items.map((b) => ({
  loc: `${BASE}/basics/${b.slug}.html`, changefreq: "monthly", priority: "0.9"
}));
const situationPages = situations.items.map((s) => ({
  loc: `${BASE}/situations/${s.slug}.html`, changefreq: "monthly", priority: "0.8"
}));
const entryPages = entries.items.map((e) => ({
  loc: `${BASE}/${entryHref(e)}`, changefreq: "monthly", priority: "0.7"
}));
const articlePages = articlePagesList.map((a) => ({
  loc: `${BASE}/articles/${a.slug}.html`, lastmod: normDate(a.date), changefreq: "monthly", priority: "0.7"
}));
const urlXml = [...staticPages, ...basicsPages, ...situationPages, ...entryPages, ...articlePages, ...newsPages].map((u) => {
  const lm = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : "";
  return `  <url>\n    <loc>${u.loc}</loc>${lm}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
}).join("\n");
writeFileSync(P("project/sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlXml}\n</urlset>\n`);
console.log(`✓ sitemap.xml を再生成（固定${staticPages.length} + 疑問${basicsPages.length} + 状況${situationPages.length} + 入口${entryPages.length} + 読み物${articlePages.length} + ニュース${newsPages.length}）`);

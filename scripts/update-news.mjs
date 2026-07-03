#!/usr/bin/env node
/**
 * update-news.mjs — ニュース自動更新パイプライン（毎日のルーティンの本体）。
 *
 *   1. Google News RSS からブランディング関連ニュースを取得
 *   2. 既存 URL と重複しないものから最大 perDay(3) 本を選定
 *   3. 各記事ごとにループ: 抽象サムネイル SVG を生成して自動で紐付け
 *   4. data/news.json を更新（直近 keep(21) 本のみ保持）
 *   5. build-data.mjs を実行して js/data.generated.js と JSON-LD を再生成
 *
 * insight（ブランディング観点の示唆）は空文字で追加される。
 * 日次ルーティン（Claude）が ROUTINE.md の手順で執筆・上書きし、
 * さらに記事内容に合わせたユニークな抽象アート SVG に差し替える。
 *
 * usage: node scripts/update-news.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeThumb } from "./gen-thumb.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEWS_PATH = resolve(ROOT, "project/data/news.json");
const DRY = process.argv.includes("--dry");

const FEEDS = [
  "https://news.google.com/rss/search?q=%E3%83%96%E3%83%A9%E3%83%B3%E3%83%87%E3%82%A3%E3%83%B3%E3%82%B0&hl=ja&gl=JP&ceid=JP:ja",
  "https://news.google.com/rss/search?q=%E3%83%96%E3%83%A9%E3%83%B3%E3%83%89%E6%88%A6%E7%95%A5&hl=ja&gl=JP&ceid=JP:ja",
  "https://news.google.com/rss/search?q=%E3%83%AA%E3%83%96%E3%83%A9%E3%83%B3%E3%83%87%E3%82%A3%E3%83%B3%E3%82%B0%20OR%20%E3%83%96%E3%83%A9%E3%83%B3%E3%83%89%E5%88%B7%E6%96%B0&hl=ja&gl=JP&ceid=JP:ja",
];

// ---- 素朴な RSS パーサ（依存ゼロ） ----
const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
};
const unCdata = (s) => s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
const unesc = (s) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[1];
    const rawTitle = unesc(unCdata(pick(body, "title")));
    // Google News の title は「見出し - 媒体名」形式
    const parts = rawTitle.split(" - ");
    const sourceName = unesc(unCdata(pick(body, "source"))) || (parts.length > 1 ? parts.at(-1) : "");
    const title = parts.length > 1 ? parts.slice(0, -1).join(" - ") : rawTitle;
    items.push({
      title,
      sourceName,
      url: unesc(unCdata(pick(body, "link"))),
      pubDate: new Date(pick(body, "pubDate") || Date.now()),
    });
  }
  return items;
}

// カテゴリの素朴な推定（ルーティンが上書きしてよい）
function guessCat(title) {
  if (/リブランド|リブランディング|刷新|社名変更|ロゴ変更|CI変更/.test(title)) return "リブランド";
  if (/採用|人材|エンプロイヤー/.test(title)) return "採用";
  if (/AI|生成|エージェント|LLM/.test(title)) return "AI時代";
  if (/調査|ランキング|指標|価値.*発表|トップ/.test(title)) return "計測";
  if (/社内|理念|パーパス|インナー/.test(title)) return "インナー";
  return "ニュース";
}

const COLORS = ["#1E2340", "#3D5070", "#9B8CC8", "#7BBAD4", "#C8A4C4", "#8CC4D0"];
const PATTERNS = ["diagonal", "dots", "lines", "grid"];

async function main() {
  const news = JSON.parse(readFileSync(NEWS_PATH, "utf8"));
  const perDay = news.policy?.perDay ?? 3;
  const keep = news.policy?.keep ?? 21;
  const known = new Set(news.items.map((n) => n.source.url));
  const knownTitles = new Set(news.items.map((n) => n.title));

  // 1. 取得
  let candidates = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, { headers: { "user-agent": "Mozilla/5.0 (BrandriBot)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      candidates.push(...parseItems(await res.text()));
    } catch (e) {
      console.warn(`⚠ feed取得失敗: ${feed.slice(0, 60)}… (${e.message})`);
    }
  }
  if (candidates.length === 0) {
    console.error("✗ どのフィードからも取得できませんでした。ネットワークを確認してください。");
    process.exit(1);
  }

  // 2. 選定（新しい順・重複排除・同一媒体偏り回避）
  candidates.sort((a, b) => b.pubDate - a.pubDate);
  const seen = new Set();
  const usedSources = new Set();
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= perDay) break;
    if (!c.url || known.has(c.url) || knownTitles.has(c.title) || seen.has(c.url)) continue;
    if (c.title.length < 12) continue;                 // 短すぎる見出しは除外
    if (usedSources.has(c.sourceName)) continue;        // 同じ媒体からは1日1本
    seen.add(c.url);
    usedSources.add(c.sourceName);
    picked.push(c);
  }
  if (picked.length === 0) {
    console.log("• 新しいニュースはありませんでした（重複のみ）。");
    return;
  }

  // 3. 追加（記事ごとにループしてサムネイルを生成・自動ではめる）
  const today = new Date().toISOString().slice(0, 10);
  const newItems = picked.map((c, i) => {
    const id = `n-${today.replace(/-/g, "")}-${i + 1}`;
    const thumb = DRY ? null : writeThumb(id, c.title); // ← 抽象アート生成ループ
    return {
      id,
      date: today,
      cat: guessCat(c.title),
      title: c.title,
      source: { name: c.sourceName || "—", url: c.url },
      insight: "",                        // ルーティン（Claude）が執筆する
      thumb,
      color: COLORS[(news.items.length + i) % COLORS.length],
      pattern: PATTERNS[(news.items.length + i) % PATTERNS.length],
    };
  });

  news.items = [...newItems, ...news.items].slice(0, keep);
  news.updated = today;

  if (DRY) {
    console.log(JSON.stringify(newItems, null, 2));
    return;
  }
  writeFileSync(NEWS_PATH, JSON.stringify(news, null, 2) + "\n");
  console.log(`✓ ${newItems.length}本を追加（計${news.items.length}本保持）`);
  newItems.forEach((n) => console.log(`  + [${n.cat}] ${n.title} — ${n.source.name}`));

  // 4. ビルド
  execFileSync(process.execPath, [resolve(ROOT, "scripts/build-data.mjs")], { stdio: "inherit" });
}

main().catch((e) => { console.error("✗", e); process.exit(1); });

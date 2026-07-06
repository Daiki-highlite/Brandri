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

// ブランディングを語れる主要メディア（経営・プロダクト・デザイン・マーケ）中心の検索クエリ。
// 実際の絞り込みは下の ALLOWLIST（媒体名）で行うため、クエリは広めに取ってよい。
const QUERIES = [
  "ブランディング 経営",
  "ブランド戦略",
  "リブランディング OR ブランド刷新",
  "コーポレートブランディング OR インナーブランディング",
  "ブランド マーケティング 戦略",
  "ブランド体験 OR 顧客体験 デザイン",
];
const FEEDS = QUERIES.map(
  (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:14d")}&hl=ja&gl=JP&ceid=JP:ja`
);

// 参照を許可する媒体（媒体名にこの文字列を含むもののみ採用）。
// 経営・ビジネス・マーケ・デザイン・PR/広告の編集メディアに限定し、
// ファッション/エンタメ/純アグリゲータ（fashion snap・ニコニコ 等）を除外する。
const ALLOWLIST = [
  // 広告・宣伝・PR・ブランディング専門
  "宣伝会議", "AdverTimes", "アドタイ", "ブレーン", "販促会議", "広報会議", "PR EDGE", "PR TIMES MAGAZINE",
  // 経営・ビジネス総合
  "日経", "日本経済新聞", "NIKKEI", "東洋経済", "ダイヤモンド", "DIAMOND", "Forbes", "フォーブス",
  "ビジネス", "Business", "プレジデント", "PRESIDENT", "ニュースイッチ", "財経", "ZUU",
  // マーケティング専門
  "MarkeZine", "マーケジン", "Web担", "ITmedia", "ferret", "MarkeTRUNK", "Agenda note", "アジェンダノート",
  "MARKETIMES", "マーケメディア", "ネットショップ担当者", "日本ネット経済新聞", "通販新聞", "ECのミカタ",
  // デザイン・プロダクト
  "AXIS", "JDN", "デザインノート", "Web Designing", "MdN", "デザイン",
  // 広告代理・調査
  "電通", "博報堂", "インテージ", "マクロミル",
];
const isAllowedMedia = (name) => !!name && ALLOWLIST.some((m) => name.includes(m));

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
  // タイトル正規化: 末尾の「 (媒体名)」や空白・記号の揺れを吸収して同一ニュースの再取得を防ぐ
  const normTitle = (t) =>
    (t || "")
      .replace(/[\s\u3000]+/g, "")
      .replace(/[（(][^）)]*[）)]\s*$/, "")
      .slice(0, 40);
  const knownTitles = new Set(news.items.map((n) => normTitle(n.title)));

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
  let skippedByMedia = 0;
  for (const c of candidates) {
    if (picked.length >= perDay) break;
    if (!c.url || known.has(c.url) || knownTitles.has(normTitle(c.title)) || seen.has(c.url)) continue;
    if (c.title.length < 12) continue;                 // 短すぎる見出しは除外
    if (!isAllowedMedia(c.sourceName)) { skippedByMedia++; continue; } // 許可媒体のみ
    if (usedSources.has(c.sourceName)) continue;        // 同じ媒体からは1日1本
    seen.add(c.url);
    usedSources.add(c.sourceName);
    picked.push(c);
  }
  if (skippedByMedia) console.log(`• 対象外メディアを ${skippedByMedia} 件スキップ（許可リスト外）`);
  if (picked.length === 0) {
    console.log("• 許可メディアからの新しいニュースはありませんでした。");
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

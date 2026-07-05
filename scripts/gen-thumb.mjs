#!/usr/bin/env node
/**
 * gen-thumb.mjs — ニュース記事の「抽象アート」サムネイル生成器。
 *
 * 2つの使い方:
 *   1) ルーティン（Claude）が記事ごとにユニークな SVG を書く際の土台・フォールバック
 *   2) CLI: node scripts/gen-thumb.mjs <id> <title> [--palette=0..5]
 *
 * タイトル文字列から決定論的に（同じ入力→同じ絵）抽象コンポジションを生成する。
 * 紙面トーン（Brandri のミネラル系パレット）に合わせた
 * グラデーション＋幾何形状＋粒子のレイヤ構成。
 * 出力: project/assets/thumbs/<id>.svg
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "project/assets/thumbs");

// Brandri パレット（styles.css / data の色域と同系）
const PALETTES = [
  ["#1E2340", "#3D5070", "#9B8CC8"],
  ["#3D5070", "#7BBAD4", "#EBEBEB"],
  ["#9B8CC8", "#C8A4C4", "#1E2340"],
  ["#7BBAD4", "#8CC4D0", "#3D5070"],
  ["#C8A4C4", "#9B8CC8", "#7BBAD4"],
  ["#1E2340", "#8CC4D0", "#C8A4C4"],
];

// 文字列 → 32bit ハッシュ（決定論の種）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// 単純な PRNG（mulberry32）
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIGHT = (o) => `rgba(250,246,236,${o})`;

// タイトルのキーワード → テーマ（パレット + 抽象モチーフ）。
// keyword が示す概念を、抽象的なコンポジションに翻訳する。上から順にマッチ。
const THEMES = [
  { key: "rebrand", pal: 2, re: /リブランド|リブランディング|刷新|社名変更|ロゴ変更|再定義|再構築|生まれ変わ/,
    // 積層した“紙”の一枚がずれる＝資産の引っ越し
    motif: (r, W, H, pal) => {
      let s = "";
      for (let i = 0; i < 4; i++) {
        const x = W * 0.24 + i * 26, y = H * 0.52 - i * 40, rot = -8 + i * 2;
        s += `<rect x="${x}" y="${y}" width="440" height="300" rx="6" transform="rotate(${rot} ${x} ${y})" fill="${LIGHT(0.06 + i * 0.05)}"/>`;
      }
      const nx = W * 0.5, ny = H * 0.16;
      s += `<rect x="${nx}" y="${ny}" width="440" height="290" rx="6" transform="rotate(9 ${nx} ${ny})" fill="${pal[0]}" opacity="0.85"/>`;
      s += `<line x1="${nx + 46}" y1="${ny + 80}" x2="${nx + 300}" y2="${ny + 80}" stroke="${LIGHT(0.5)}" stroke-width="9" transform="rotate(9 ${nx} ${ny})"/>`;
      return s;
    } },
  { key: "ai", pal: 3, re: /\bAI\b|生成|エージェント|LLM|DX|デジタル|データ|テック|自動化/,
    // ノードのネットワーク（結節点）
    motif: (r, W, H, pal) => {
      const pts = Array.from({ length: 7 }, () => [W * (0.2 + r() * 0.6), H * (0.2 + r() * 0.6)]);
      let s = "";
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        if (r() > 0.55) continue;
        s += `<line x1="${pts[i][0].toFixed(0)}" y1="${pts[i][1].toFixed(0)}" x2="${pts[j][0].toFixed(0)}" y2="${pts[j][1].toFixed(0)}" stroke="${LIGHT(0.28)}" stroke-width="1.2"/>`;
      }
      pts.forEach(([x, y], i) => { s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${i % 3 === 0 ? 11 : 6}" fill="${i % 2 ? pal[0] : LIGHT(0.85)}"/>`; });
      return s;
    } },
  { key: "hiring", pal: 4, re: /採用|人材|エンプロイヤー|求人|入社|組織/,
    // 散らばる点が一点に集まる（求心）
    motif: (r, W, H, pal) => {
      const cx = W * 0.5, cy = H * 0.5;
      let s = `<circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="${LIGHT(0.6)}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="14" fill="${pal[0]}"/>`;
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2, d = 200 + r() * 260;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        s += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(cx + Math.cos(a) * 80).toFixed(0)}" y2="${(cy + Math.sin(a) * 80).toFixed(0)}" stroke="${LIGHT(0.22)}" stroke-width="1.2"/>`;
        s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + r() * 3).toFixed(1)}" fill="${LIGHT(0.7)}"/>`;
      }
      return s;
    } },
  { key: "manage", pal: 0, re: /経営|戦略|事業|上場|IPO|投資|M&A|買収|提携|拡張|グループ/,
    // 高さの異なる柱（構造・積み上げ）
    motif: (r, W, H, pal) => {
      let s = "";
      const n = 6, bw = 70, gap = 40, total = n * bw + (n - 1) * gap, x0 = (W - total) / 2;
      for (let i = 0; i < n; i++) {
        const h = 120 + r() * 320, x = x0 + i * (bw + gap), y = H * 0.82 - h;
        s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw}" height="${h.toFixed(0)}" fill="${i % 2 ? pal[0] : LIGHT(0.14)}" opacity="0.9"/>`;
        s += `<rect x="${x.toFixed(0)}" y="${(y - 10).toFixed(0)}" width="${bw}" height="6" fill="${LIGHT(0.5)}"/>`;
      }
      return s;
    } },
  { key: "design", pal: 2, re: /デザイン|VI|ロゴ|クリエイティブ|アート|ビジュアル|パッケージ/,
    // 重なる半透明のプリズム（三角）
    motif: (r, W, H, pal) => {
      let s = "";
      for (let i = 0; i < 3; i++) {
        const cx = W * (0.4 + r() * 0.2), cy = H * (0.45 + r() * 0.1), sz = 200 + r() * 120, rot = r() * 60;
        const p = [[cx, cy - sz], [cx - sz * 0.87, cy + sz * 0.5], [cx + sz * 0.87, cy + sz * 0.5]]
          .map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ");
        s += `<polygon points="${p}" transform="rotate(${rot.toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})" fill="${i === 1 ? pal[0] : LIGHT(0.1)}" opacity="0.55" stroke="${LIGHT(0.4)}" stroke-width="1.2"/>`;
      }
      return s;
    } },
  { key: "experience", pal: 5, re: /体験|顧客|CX|UX|接点|コミュニ|共感|ファン|ロイヤ/,
    // 一点から広がる同心の波（響き）
    motif: (r, W, H, pal) => {
      const cx = W * (0.3 + r() * 0.4), cy = H * 0.5;
      let s = `<circle cx="${cx.toFixed(0)}" cy="${cy}" r="12" fill="${pal[0]}"/>`;
      for (let i = 1; i <= 6; i++) s += `<circle cx="${cx.toFixed(0)}" cy="${cy}" r="${i * 55}" fill="none" stroke="${LIGHT(0.5 - i * 0.06)}" stroke-width="${(3 - i * 0.3).toFixed(1)}"/>`;
      return s;
    } },
  { key: "measure", pal: 1, re: /調査|指標|計測|ランキング|統計|効果|ROI|売上|成長|突破|達成|億/,
    // 上昇する棒＋トレンド線
    motif: (r, W, H, pal) => {
      let s = "";
      const n = 7, bw = 58, gap = 46, total = n * bw + (n - 1) * gap, x0 = (W - total) / 2;
      const tops = [];
      for (let i = 0; i < n; i++) {
        const h = 70 + (i / n) * 300 + r() * 60, x = x0 + i * (bw + gap), y = H * 0.82 - h;
        tops.push([x + bw / 2, y]);
        s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw}" height="${h.toFixed(0)}" fill="${LIGHT(0.12)}"/>`;
      }
      s += `<polyline points="${tops.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ")}" fill="none" stroke="${pal[0]}" stroke-width="4"/>`;
      tops.forEach(([x, y]) => s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="5" fill="${LIGHT(0.9)}"/>`);
      return s;
    } },
];
// 既定テーマ（結晶）: どのキーワードにも当たらないとき
const DEFAULT_THEME = {
  key: "crystal", pal: null,
  motif: (r, W, H, pal) => {
    let s = "";
    for (let i = 0; i < 3; i++) s += `<circle cx="${(W * (0.2 + r() * 0.6)).toFixed(0)}" cy="${(H * (0.2 + r() * 0.6)).toFixed(0)}" r="${(80 + r() * 300).toFixed(0)}" fill="none" stroke="${LIGHT(0.2)}" stroke-width="1.5"/>`;
    const cx = W * (0.3 + r() * 0.4), cy = H * (0.3 + r() * 0.4), n = 5 + Math.floor(r() * 3), r0 = 90 + r() * 150;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = (Math.PI * 2 * k) / n + r() * 0.4, rr = r0 * (0.7 + r() * 0.5);
      return `${(cx + Math.cos(a) * rr).toFixed(0)},${(cy + Math.sin(a) * rr).toFixed(0)}`;
    }).join(" ");
    s += `<polygon points="${pts}" fill="${pal[0]}" opacity="0.35" stroke="${LIGHT(0.5)}" stroke-width="1.4"/>`;
    return s;
  },
};

function pickTheme(title) {
  for (const t of THEMES) if (t.re.test(title)) return t;
  return DEFAULT_THEME;
}

export function generateThumbSvg(id, title, paletteIndex = null) {
  const seed = hash(id + "::" + title);
  const rand = rng(seed);
  const theme = pickTheme(title || "");
  const palIdx = paletteIndex ?? (theme.pal != null ? theme.pal : seed % PALETTES.length);
  const pal = PALETTES[palIdx];
  const W = 1200, H = 750;
  const ang = 90 + Math.floor(rand() * 120); // 概ね斜め〜縦のグラデ

  // キーワード由来のモチーフ（主役）
  const motif = theme.motif(rand, W, H, pal);

  // 粒子（テクスチャ・共通）
  let dots = "";
  const nd = 20 + Math.floor(rand() * 24);
  for (let i = 0; i < nd; i++) {
    dots += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(0.8 + rand() * 2.2).toFixed(1)}" fill="${LIGHT((0.15 + rand() * 0.4).toFixed(2))}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${ang})">
      <stop offset="0%" stop-color="${pal[0]}"/>
      <stop offset="55%" stop-color="${pal[1]}"/>
      <stop offset="100%" stop-color="${pal[2]}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${motif}
  ${dots}
</svg>`;
}

export function writeThumb(id, title, paletteIndex = null) {
  mkdirSync(OUT_DIR, { recursive: true });
  const svg = generateThumbSvg(id, title, paletteIndex);
  const out = resolve(OUT_DIR, `${id}.svg`);
  writeFileSync(out, svg);
  return `assets/thumbs/${id}.svg`;
}

// CLI
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [id, title] = process.argv.slice(2);
  if (!id || !title) {
    console.error("usage: node scripts/gen-thumb.mjs <id> <title>");
    process.exit(1);
  }
  console.log("✓ " + writeThumb(id, title));
}

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

export function generateThumbSvg(id, title, paletteIndex = null) {
  const seed = hash(id + "::" + title);
  const rand = rng(seed);
  const pal = PALETTES[paletteIndex ?? seed % PALETTES.length];
  const W = 1200, H = 750;

  const ang = Math.floor(rand() * 360);
  let shapes = "";

  // 大きな円弧／リング（結晶の断面のイメージ）
  const rings = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < rings; i++) {
    const cx = W * (0.2 + rand() * 0.6);
    const cy = H * (0.2 + rand() * 0.6);
    const r = 80 + rand() * 320;
    const sw = 1 + rand() * 3;
    const op = 0.15 + rand() * 0.35;
    shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="rgba(250,246,236,${op.toFixed(2)})" stroke-width="${sw.toFixed(1)}"/>`;
  }
  // 斜行するプレート（市場の圧力のイメージ）
  const plates = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < plates; i++) {
    const x = rand() * W, y = rand() * H;
    const w = 200 + rand() * 500, h = 8 + rand() * 26;
    const rot = -35 + rand() * 70;
    const c = pal[Math.floor(rand() * pal.length)];
    const op = 0.25 + rand() * 0.4;
    shapes += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" transform="rotate(${rot.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${c}" opacity="${op.toFixed(2)}"/>`;
  }
  // 結晶の多角形
  const polys = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < polys; i++) {
    const cx = W * (0.25 + rand() * 0.5), cy = H * (0.25 + rand() * 0.5);
    const n = 5 + Math.floor(rand() * 3);
    const r0 = 60 + rand() * 180;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = (Math.PI * 2 * k) / n + rand() * 0.5;
      const r = r0 * (0.7 + rand() * 0.5);
      return `${(cx + Math.cos(a) * r).toFixed(0)},${(cy + Math.sin(a) * r).toFixed(0)}`;
    }).join(" ");
    shapes += `<polygon points="${pts}" fill="none" stroke="rgba(250,246,236,${(0.3 + rand() * 0.3).toFixed(2)})" stroke-width="1.2"/>`;
  }
  // 粒子
  const dots = 24 + Math.floor(rand() * 30);
  for (let i = 0; i < dots; i++) {
    shapes += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(0.8 + rand() * 2.4).toFixed(1)}" fill="rgba(250,246,236,${(0.2 + rand() * 0.5).toFixed(2)})"/>`;
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
  ${shapes}
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

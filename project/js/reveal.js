// Brandri — 主要タイトル/見出しのスクロール出現（全ページ共通）
// 見出しの中身を .t-mask > .t-inner にラップし、下からせり上がり＋出現時グロー（CSS: .t-rise）。
// index.html のヒーロー見出しは main.js が別途担当。
(function () {
  "use strict";
  var SEL = [
    ".section-title", ".basics-title",        // トップ
    "h1.news-title",                          // 記事 / ニュース / 入口 / 状況 のヒーロー
    ".ai-hero h1", ".ai-sec h2",              // AI×ブランディング ハブ
    ".fs-hero h1", ".fs-section h2",          // 今から始めるブランディング
    ".acv-hero h1",                           // （旧AIランディング互換）
    ".kn-hero h1",                            // ジャーナル一覧
    ".gd-term",                               // 用語集の見出し語
    ".basic-hero h1", ".situation-hero h1"    // 5大疑問 / 状況ランディング（存在すれば）
  ].join(", ");

  var targets = document.querySelectorAll(SEL);
  if (!targets.length) return;

  var supportsIO = "IntersectionObserver" in window;
  var io = supportsIO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }) : null;

  targets.forEach(function (el) {
    if (el.querySelector(".t-mask")) return;          // 二重ラップ防止
    var mask = document.createElement("span");  mask.className = "t-mask";
    var inner = document.createElement("span"); inner.className = "t-inner";
    while (el.firstChild) inner.appendChild(el.firstChild);
    mask.appendChild(inner);
    el.appendChild(mask);
    el.classList.add("t-rise");
    if (io) io.observe(el);
  });

  // 保険: IO 非対応/未発火でも、見出しが隠れたまま残らないよう出現させる
  function revealVisible() {
    document.querySelectorAll(".t-rise:not(.in)").forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add("in");
    });
  }
  window.addEventListener("scroll", revealVisible, { passive: true });
  window.addEventListener("load", revealVisible);
  setTimeout(revealVisible, 700);
  revealVisible();
})();

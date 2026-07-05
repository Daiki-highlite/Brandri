// Brandri — basics（5大疑問）精緻ページ専用の軽量スクリプト。
// 依存なし。JSオフでも本文・タブ・Q&Aは全て閲覧できる（プログレッシブエンハンスメント）。
(function () {
  // ===== 読了プログレスバー =====
  var bar = document.getElementById("reading-progress");
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var p = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
      bar.style.transform = "scaleX(" + Math.max(0, Math.min(1, p)) + ")";
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  // ===== タブ =====
  document.querySelectorAll(".tabset[data-tabs]").forEach(function (set) {
    set.classList.add("js-tabs"); // JSが効いた合図（CSSで非アクティブを隠す）
    var tabs = Array.prototype.slice.call(set.querySelectorAll(".tab"));
    var panels = Array.prototype.slice.call(set.querySelectorAll(".tabpanel"));
    function activate(i) {
      tabs.forEach(function (t, j) {
        var on = j === i;
        t.classList.toggle("is-on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach(function (p, j) { p.classList.toggle("is-on", j === i); });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { activate(i); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          var ni = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
          tabs[ni].focus(); activate(ni);
        }
      });
    });
    activate(0);
  });

  // ===== 目次: スムーススクロール + 現在地ハイライト =====
  var toc = document.querySelector(".basics-toc");
  if (toc) {
    var links = Array.prototype.slice.call(toc.querySelectorAll("a"));
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (id && id.charAt(0) === "#") {
          var el = document.querySelector(id);
          if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
        }
      });
    });
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if ("IntersectionObserver" in window && targets.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            links.forEach(function (a) { a.classList.toggle("is-on", a.getAttribute("href") === "#" + en.target.id); });
          }
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      targets.forEach(function (t) { io.observe(t); });
    }
  }
})();

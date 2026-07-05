// Brandri — グローバル検索（ヘッダーの検索ボタン / ⌘K）。全ページで読み込む。
// window.BRANDRI_SEARCH（data.generated.js が出力）を対象に、用語・読み物・入口・
// 5大疑問・状況・ニュースを横断検索する。href はサイトルート相対。
(function () {
  if (window.__brandriSearchReady) return;
  window.__brandriSearchReady = true;

  var esc = function (s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  // ---- overlay DOM ----
  var ov = document.createElement("div");
  ov.className = "search-overlay";
  ov.setAttribute("hidden", "");
  ov.innerHTML =
    '<div class="so-backdrop" data-close></div>' +
    '<div class="so-panel" role="dialog" aria-modal="true" aria-label="サイト内検索">' +
      '<div class="so-inputrow">' +
        '<svg class="so-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '<input class="so-input" type="text" placeholder="用語・記事・5大疑問を検索…" autocomplete="off" spellcheck="false" aria-label="検索キーワード">' +
        '<kbd class="so-esc">Esc</kbd>' +
      '</div>' +
      '<div class="so-results" id="so-results"></div>' +
      '<div class="so-foot"><span>↑↓ で移動</span><span>Enter で開く</span><span id="so-count"></span></div>' +
    '</div>';
  document.body.appendChild(ov);

  var input = ov.querySelector(".so-input");
  var resultsEl = ov.querySelector("#so-results");
  var countEl = ov.querySelector("#so-count");
  var sel = 0;
  var current = [];

  var ALL = function () { return window.BRANDRI_SEARCH || []; };

  function score(item, q) {
    var t = item.t.toLowerCase(), s = (item.sub || "").toLowerCase();
    if (t === q) return 100;
    if (t.indexOf(q) === 0) return 80;
    if (t.indexOf(q) > -1) return 60;
    if (s.indexOf(q) > -1) return 30;
    return 0;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      current = ALL().slice(0, 8);
      countEl.textContent = ALL().length + " 件を検索";
    } else {
      current = ALL().map(function (it) { return { it: it, sc: score(it, q) }; })
        .filter(function (x) { return x.sc > 0; })
        .sort(function (a, b) { return b.sc - a.sc; })
        .slice(0, 30).map(function (x) { return x.it; });
      countEl.textContent = current.length + " 件";
    }
    sel = 0;
    if (!current.length) {
      resultsEl.innerHTML = '<div class="so-empty">該当する項目がありません</div>';
      return;
    }
    resultsEl.innerHTML = current.map(function (it, i) {
      return '<a class="so-item' + (i === 0 ? " is-sel" : "") + '" href="' + esc(it.href) + '" data-i="' + i + '">' +
        '<span class="so-kind">' + esc(it.kind) + '</span>' +
        '<span class="so-main"><span class="so-t">' + esc(it.t) + '</span><span class="so-sub">' + esc(it.sub) + '</span></span>' +
        '<span class="so-go">→</span>' +
      '</a>';
    }).join("");
  }

  function move(d) {
    var items = resultsEl.querySelectorAll(".so-item");
    if (!items.length) return;
    items[sel] && items[sel].classList.remove("is-sel");
    sel = (sel + d + items.length) % items.length;
    items[sel].classList.add("is-sel");
    items[sel].scrollIntoView({ block: "nearest" });
  }

  function open() {
    ov.removeAttribute("hidden");
    document.documentElement.style.overflow = "hidden";
    render();
    setTimeout(function () { input.focus(); input.select(); }, 20);
  }
  function close() {
    ov.setAttribute("hidden", "");
    document.documentElement.style.overflow = "";
    input.value = "";
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      var a = resultsEl.querySelectorAll(".so-item")[sel];
      if (a) location.href = a.getAttribute("href");
    } else if (e.key === "Escape") { close(); }
  });
  ov.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) close();
  });
  resultsEl.addEventListener("mousemove", function (e) {
    var a = e.target.closest(".so-item"); if (!a) return;
    var i = +a.dataset.i;
    if (i !== sel) {
      resultsEl.querySelectorAll(".so-item").forEach(function (el) { el.classList.remove("is-sel"); });
      a.classList.add("is-sel"); sel = i;
    }
  });

  // ---- wiring: すべての検索ボタン + ⌘K / Ctrl+K ----
  function wire() {
    document.querySelectorAll(".search-btn").forEach(function (btn) {
      if (btn.__wired) return; btn.__wired = true;
      btn.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });
  }
  wire();
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); open(); }
    else if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test((e.target.tagName || "")) && ov.hasAttribute("hidden")) {
      e.preventDefault(); open();
    }
  });
  // React 等で後から追加されるボタンにも対応
  new MutationObserver(wire).observe(document.body, { childList: true, subtree: true });
})();

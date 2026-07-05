// Brandri — scroll reveal, tweaks, hero scroll link
(function () {
  // ===== SVG pattern thumbnail (shared with cases.jsx pattern logic) =====
  function makePatternBg(pattern, color) {
    const fg = "rgba(250,246,236,0.28)";
    let svg = "";
    if (pattern === "diagonal") svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${color}"/><path d="M0 40 L40 0 M-10 10 L10 -10 M30 50 L50 30" stroke="${fg}" stroke-width="1.5"/></svg>`;
    else if (pattern === "dots") svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="${color}"/><circle cx="14" cy="14" r="2" fill="${fg}"/></svg>`;
    else if (pattern === "lines") svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/><path d="M0 4 L8 4" stroke="${fg}" stroke-width="1"/></svg>`;
    else svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="${color}"/><path d="M0 0 L24 0 M0 0 L0 24" stroke="${fg}" stroke-width="1"/></svg>`;
    return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`;
  }
  window.__brandriPattern = makePatternBg;

  // ===== Render Latest strip =====
  // ニュース自動更新エリア: data/news.json（毎日3本 + 抽象アートサムネ）を表示。
  // ニュースが未取得の間は従来の「今週の更新」（読み物）へフォールバック。
  (function renderLatest() {
    const strip = document.getElementById("latest-strip");
    if (!strip) return;
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const news = window.BRANDRI_NEWS || [];

    if (news.length > 0) {
      strip.innerHTML = news.slice(0, 7).map(n => {
        const bg = n.thumb
          ? `url('${esc(n.thumb)}')`
          : makePatternBg(n.pattern, n.color);
        const dateFmt = esc((n.date || "").replace(/-/g, "."));
        // カードは外部ニュースに直リンクせず、まず自社の詳細記事へ送る（回遊 + SEO）
        const href = `news/${esc(n.id)}.html`;
        const heading = esc(n.headline || n.title);
        return `
      <a href="${href}" class="latest-card">
        <div class="lc-thumb" style="background-image:${bg};">
          <span class="lc-num">${esc(n.cat)}</span>
          <span class="lc-date">${dateFmt}</span>
        </div>
        <div class="lc-cat">${esc(n.source.name)}</div>
        <div class="lc-title">${heading}</div>
        ${n.insight ? `<div class="lc-insight"><span class="lc-insight-label">▸ Brandri View</span>${esc(n.insight)}</div>` : ""}
      </a>`;
      }).join("");
      return;
    }

    if (!window.BRANDRI_LATEST) return;
    strip.innerHTML = window.BRANDRI_LATEST.map(a => `
      <a href="knowledge.html#a${a.num}" class="latest-card">
        <div class="lc-thumb" style="background-image:${makePatternBg(a.pattern, a.color)};">
          <span class="lc-num">№ ${a.num}</span>
          <span class="lc-date">${a.date}</span>
        </div>
        <div class="lc-cat">${a.cat}</div>
        <div class="lc-title">${a.title}</div>
      </a>
    `).join("");
  })();


  // ===== Render Knowledge grid (§04 今週の読み物) from newest articles with detail pages =====
  // slug + 本文を持つ読み物を新しい順に並べ、先頭をFeatureにしてカード表示。
  // 詳細ページ（articles/<slug>.html）へ直リンク。該当が3本未満なら静的HTMLのまま。
  (function renderKnowledge() {
    const grid = document.querySelector(".knowledge-grid");
    if (!grid) return;
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");
    const all = (window.BRANDRI_KNOWLEDGE_ALL || []).filter(a => a.slug && a.lead);
    if (all.length < 3) return; // フォールバック: 既存の静的Feature
    all.sort((a, b) => Number(b.num) - Number(a.num));
    const picks = all.slice(0, 6);
    const CAT_EN = { "経営": "Essay", "定義論": "Essay", "採用": "Field note", "インナー": "Essay", "計測": "Framework", "運用": "Field note", "フェーズ別": "Framework", "リブランド": "Essay", "AI時代": "Essay" };
    grid.innerHTML = picks.map((a, i) => {
      const feature = i === 0;
      const kicker = `${CAT_EN[a.cat] || "Essay"} · ${esc(a.cat)}`;
      const note = a.pullquote
        ? `<div class="k-note"><div class="k-note-label">▸ Highlite Note</div><p>${esc(stripTags(a.pullquote))}</p></div>`
        : "";
      const excerpt = feature ? `<p class="k-excerpt">${esc(stripTags(a.lead))}</p>` : `<p class="k-excerpt">${esc(stripTags(a.lead))}</p>`;
      const sources = (a.sources && a.sources.length)
        ? `<div class="k-sources">Sources · ${a.sources.map(s => `${esc(s.author)} (${s.year || "—"})`).join(" ／ ")}</div>` : "";
      return `
      <a class="k-card${feature ? " feature" : ""}" href="articles/${esc(a.slug)}.html">
        <div class="k-cat">${kicker}</div>
        ${feature ? `<div class="k-placeholder" style="background-image:${makePatternBg(a.pattern, a.color)};"></div>` : ""}
        <h3 class="k-title">${esc(a.title)}</h3>
        ${excerpt}
        ${note}
        ${sources}
        <div class="k-meta">
          <span>№ ${esc(a.num)} / ${esc(a.cat)}</span>
          <span>${esc(a.date)}</span>
        </div>
      </a>`;
    }).join("");
  })();

  // ===== Reveal on scroll =====
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );

  function observeAll() {
    document.querySelectorAll(".reveal:not(.in), .hero-title:not(.in), .hero-eyebrow:not(.in), .hero-meta:not(.in), .tategaki:not(.in), .section-head:not(.in), .phil-tenet:not(.in)").forEach(el => io.observe(el));
  }
  observeAll();
  // Trigger hero immediately on load (above the fold) — multiple fallbacks to beat any race
  function activateHero() {
    document.querySelectorAll(".hero-title, .hero-eyebrow, .hero-meta, .tategaki").forEach(el => el.classList.add("in"));
    document.body.classList.add("loaded");
  }
  // Fire on multiple events to guarantee at least one wins
  requestAnimationFrame(() => requestAnimationFrame(activateHero));
  setTimeout(activateHero, 100);
  setTimeout(activateHero, 500);
  if (document.readyState === "complete") activateHero();
  else window.addEventListener("load", activateHero);
  // Re-observe after React mounts (mutation observer for new nodes)
  const mo = new MutationObserver(() => observeAll());
  mo.observe(document.body, { childList: true, subtree: true });

  // ===== Hero scroll-linked parallax on title =====
  const heroTitle = document.querySelector(".hero-title");
  const heroLede  = document.querySelector(".hero-lede");
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (heroTitle && y < 800) {
      heroTitle.style.transform = `translateY(${y * 0.12}px)`;
      heroTitle.style.opacity = String(Math.max(0, 1 - y / 600));
    }
    if (heroLede && y < 800) {
      heroLede.style.transform = `translateY(${y * 0.2}px)`;
      heroLede.style.opacity = String(Math.max(0, 1 - y / 500));
    }
    const tate = document.querySelector(".tategaki");
    if (tate) tate.style.transform = `translateY(${y * 0.3}px)`;
    const issue = document.querySelector(".hero-issue");
    if (issue) issue.style.transform = `translateY(${y * 0.18}px)`;
  }, { passive: true });

  // ===== Cursor bird (main) — smooth lerp follow =====
  (function setupCursorBird(){
    const bird = document.getElementById("bird-cursor");
    if (!bird) return;
    // skip on touch / coarse pointers
    if (matchMedia("(hover: none)").matches) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let bx = mx, by = my;
    let lastMx = mx;
    let dirX = 1; // 1 = facing right (default art faces right), -1 = flipped
    let active = false;

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!active) {
        bx = mx; by = my;
        bird.classList.add("is-active");
        active = true;
      }
    }, { passive: true });

    window.addEventListener("mouseleave", () => {
      bird.classList.remove("is-active");
      active = false;
    });

    function tick(){
      // ease toward cursor
      const ease = 0.12;
      bx += (mx - bx) * ease;
      by += (my - by) * ease;

      // direction based on horizontal velocity (smoothed)
      const dx = mx - lastMx;
      if (Math.abs(dx) > 0.6) {
        dirX = dx < 0 ? -1 : 1;
        lastMx = mx;
      }
      // offset so bird sits near cursor (slightly above-left)
      const ox = -16 * dirX;
      const oy = -12;
      bird.style.transform = `translate3d(${bx + ox}px, ${by + oy}px, 0) scaleX(${dirX})`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  // ===== Tweaks =====
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accentColor": "#9B8CC8",
    "paperBg": "#EBEBEB",
    "paperCard": "#F4F4F4",
    "headingWeight": 400
  }/*EDITMODE-END*/;

  function applyTweaks(t, isInit) {
    const r = document.documentElement.style;
    r.setProperty("--vermillion", t.accentColor);
    if (isInit) {
      // On init, REMOVE any host-injected --ivory/--paper so the cool palette
      // in styles.css wins. (The preview host may inject stale EDITMODE state
      // as inline :root styles before this script runs.)
      r.removeProperty("--ivory");
      r.removeProperty("--paper");
    } else {
      r.setProperty("--ivory", t.paperBg);
      r.setProperty("--paper", t.paperCard);
    }
    document.querySelectorAll(".hero-title, .section-title, .k-title, .phil-lead, .diag-q, .cta h2")
      .forEach(el => el.style.fontWeight = t.headingWeight);
  }
  let tw = { ...TWEAK_DEFAULTS };
  applyTweaks(tw, true);
  // Host may inject EDITMODE inline styles AFTER our IIFE runs — keep clearing
  // until we're sure the cool palette has won.
  function forceCool() {
    const s = document.documentElement.style;
    s.removeProperty("--ivory");
    s.removeProperty("--paper");
  }
  [50, 200, 500, 1000, 2000].forEach(ms => setTimeout(forceCool, ms));
  // Also watch for the host re-injecting and immediately strip
  const rootObserver = new MutationObserver(() => {
    const s = document.documentElement.style;
    if (s.getPropertyValue("--ivory") || s.getPropertyValue("--paper")) {
      forceCool();
    }
  });
  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });

  const panel = document.getElementById("tweaks-panel");

  window.addEventListener("message", (e) => {
    if (!e.data || !e.data.type) return;
    if (e.data.type === "__activate_edit_mode") panel.classList.add("open");
    if (e.data.type === "__deactivate_edit_mode") panel.classList.remove("open");
  });
  // Announce availability after listener is set
  setTimeout(() => {
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (_) {}
  }, 50);

  function persist(edits) {
    try {
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits }, "*");
    } catch(_) {}
  }

  // accent
  document.querySelectorAll("#tw-accent .tw-swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      document.querySelectorAll("#tw-accent .tw-swatch").forEach(s => s.classList.remove("on"));
      sw.classList.add("on");
      tw.accentColor = sw.dataset.c;
      applyTweaks(tw);
      persist({ accentColor: tw.accentColor });
    });
  });
  // paper
  document.querySelectorAll("#tw-paper .tw-swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      document.querySelectorAll("#tw-paper .tw-swatch").forEach(s => s.classList.remove("on"));
      sw.classList.add("on");
      tw.paperBg = sw.dataset.ivory;
      tw.paperCard = sw.dataset.paper;
      applyTweaks(tw);
      persist({ paperBg: tw.paperBg, paperCard: tw.paperCard });
    });
  });
  // heading weight
  document.querySelectorAll("#tw-weight button").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#tw-weight button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      tw.headingWeight = Number(b.dataset.w);
      applyTweaks(tw);
      persist({ headingWeight: tw.headingWeight });
    });
  });
})();

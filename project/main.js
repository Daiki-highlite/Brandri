// Brandri — scroll reveal, tweaks, hero scroll link
(function () {
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

// Diagnostic — David Aaker's 5 Brand Equity Pillars
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD } = React;

// Animated number — counts up from 0 to target with ease-out
function CountUp({ to, duration = 1600, delay = 0, suffix = "", className = "" }) {
  const [val, setVal] = useStateD(0);
  const startedRef = useRefD(false);
  useEffectD(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const t0 = performance.now() + delay;
    let raf;
    const tick = (now) => {
      const elapsed = Math.max(0, now - t0);
      const p = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, []);
  return <span className={className}>{val}{suffix}</span>;
}

// Animated star rating — stars fly in one by one with bounce
function StarRating({ count, max = 5, delay = 0 }) {
  const [shown, setShown] = useStateD(0);
  useEffectD(() => {
    let cancelled = false;
    const t0 = setTimeout(() => {
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i++;
        setShown(i);
        if (i < max) setTimeout(tick, 110);
      };
      tick();
    }, delay);
    return () => { cancelled = true; clearTimeout(t0); };
  }, []);
  return (
    <div className="stars">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < count;
        const visible = i < shown;
        return (
          <span
            key={i}
            className={"star" + (filled ? " filled" : " empty") + (visible ? " in" : "")}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M12 2.5l2.9 6.2 6.6.7-4.9 4.6 1.4 6.5L12 17.3 6 20.5l1.4-6.5L2.5 9.4l6.6-.7L12 2.5z"
                    fill={filled ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round" />
            </svg>
          </span>
        );
      })}
    </div>
  );
}

// ===== リード獲得ゲート（チェックリストPDF と引き換えにメール取得）=====
// 保存先は Google スプレッドシート（Apps Script Web App）。下の LEAD_ENDPOINT に
// デプロイ後の /exec URL を貼るだけで送信が有効化される（空でもDLは動くが保存されない）。
const LEAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbyyxlrhrVsjpxg2C_DA68drmmKiF5PQ8ZRCq78KyszowAQE4N46889xqCEZyrwfohq7dQ/exec";
const CHECKLIST_URL = "assets/brandri-branding-checklist.pdf";
const LEAD_STORE_KEY = "brandri_lead_done";

function LeadGate() {
  const [done, setDone] = useStateD(false);
  const [name, setName] = useStateD("");
  const [org, setOrg] = useStateD("");
  const [email, setEmail] = useStateD("");
  const [busy, setBusy] = useStateD(false);
  const [err, setErr] = useStateD("");

  useEffectD(() => {
    try { if (localStorage.getItem(LEAD_STORE_KEY)) setDone(true); } catch (e) {}
  }, []);

  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !org.trim() || !validEmail(email)) {
      setErr("お名前・所属・正しいメールアドレスをご入力ください。");
      return;
    }
    setErr(""); setBusy(true);
    const payload = {
      name: name.trim(), org: org.trim(), email: email.trim(),
      source: "diagnostic-checklist", page: location.pathname,
      ts: new Date().toISOString(),
    };
    try {
      if (LEAD_ENDPOINT) {
        // Apps Script は text/plain なら preflight 無しで受けられる（no-cors で送信）
        await fetch(LEAD_ENDPOINT, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
      }
    } catch (e) { /* no-cors のため成否は不可視。体験優先でDLは解禁 */ }
    try { localStorage.setItem(LEAD_STORE_KEY, "1"); } catch (e) {}
    if (typeof gtag === "function") gtag("event", "lead_submit", { event_category: "cv", method: "diagnostic-checklist" });
    setBusy(false); setDone(true);
  };

  if (done) {
    return (
      <div className="lead-gate is-done">
        <div className="lg-head"><span className="lg-label">Checklist</span><span className="lg-free">ダウンロード可能</span></div>
        <p className="lg-lede">ありがとうございます。下のボタンからチェックリストを受け取れます。</p>
        <a className="btn" href={CHECKLIST_URL} download
           onClick={() => { if (typeof gtag === "function") gtag("event", "checklist_download", { event_category: "cv" }); }}>
          ブランディング・チェックリスト（PDF）を受け取る →
        </a>
      </div>
    );
  }

  return (
    <div className="lead-gate">
      <div className="lg-head"><span className="lg-label">Checklist</span><span className="lg-free">無料ダウンロード</span></div>
      <p className="lg-lede">
        診断の5観点を実務に落とす<em>ブランディング・チェックリスト</em>（PDF・全3ページ）を差し上げます。
        受け取り先をご入力ください。
      </p>
      <form className="lg-form" onSubmit={submit} noValidate>
        <div className="lg-row">
          <input type="text" placeholder="お名前" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input type="text" placeholder="会社・団体名" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" />
        </div>
        <input type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {err && <div className="lg-err">{err}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "送信中…" : "チェックリストを受け取る →"}</button>
        <p className="lg-fine">ご入力の情報は、資料提供と関連するご案内にのみ利用します。第三者提供はしません。</p>
      </form>
    </div>
  );
}

function Diagnostic() {
  const questions = window.BRANDRI_QUESTIONS;
  const [step, setStep] = useStateD(0);
  const [answers, setAnswers] = useStateD(Array(questions.length).fill(null));
  const [done, setDone] = useStateD(false);

  const pick = (i) => {
    const next = [...answers];
    next[step] = i;
    setAnswers(next);
  };

  const forward = () => {
    if (step < questions.length - 1) {
      setStep(step + 1);
      if (typeof gtag === "function" && step === 0) gtag("event", "diagnostic_start", { event_category: "diagnostic" });
    } else {
      setDone(true);
      if (typeof gtag === "function") gtag("event", "diagnostic_complete", { event_category: "diagnostic" });
    }
  };
  const back = () => { if (step > 0) setStep(step - 1); };
  const restart = () => { setStep(0); setAnswers(Array(questions.length).fill(null)); setDone(false); };

  // Per-pillar score: weights are 4/3/2/1, map directly to 4/3/2/1 stars; we use 5 max.
  // 4=5stars, 3=4, 2=2, 1=1 — gives a more dramatic spread than 4/3/2/1.
  const starsForWeight = (w) => ({ 4: 5, 3: 4, 2: 2, 1: 1 }[w] || 0);
  const pillarStars = answers.map((a, i) => {
    if (a === null) return 0;
    return starsForWeight(questions[i].weights[a]);
  });
  const totalStars = pillarStars.reduce((s, v) => s + v, 0);
  const maxStars = questions.length * 5;
  const totalScore = Math.round((totalStars / maxStars) * 100);

  const grade = (s) => {
    if (s >= 80) return { g: "Equity Established", ja: "エクイティ確立期", msg: "5つの柱が均衡を保っている状態。次の課題は、AI時代の運用ルールと、定点観測の仕組み化です。" };
    if (s >= 60) return { g: "Equity Forming", ja: "エクイティ形成期", msg: "中核の柱は立っていますが、特定の柱に偏りがあります。最も低い柱から立て直しを。" };
    if (s >= 40) return { g: "Foundations Building", ja: "基盤構築期", msg: "個々の活動はあっても、エクイティとして積み上がっていない状態。連想と一貫性の設計から。" };
    return { g: "Foundational", ja: "起点期", msg: "ブランドエクイティの議論が未着手。まずは認知（差別化の一行）と、判断基準の明文化から始めましょう。" };
  };

  // Score-based content recommendations.
  // Each grade maps to an article, a case, and a navigation suggestion.
  const recommend = (s) => {
    if (s >= 80) return {
      note: "ここから先は、AI時代の運用と計測の話に進むのが自然です。",
      items: [
        { kind: "読み物", title: "Agentic AI時代、ブランドはむしろ重くなる。", why: "AI が判断基準を露出させる時代の前提整理。", href: "#knowledge" },
        { kind: "事例",   title: "Highlite Inc. — 結晶化ブランディング", why: "確立後の運用フェーズで自社実装した記録。", href: "#cases" },
        { kind: "次の問い", title: "計測と運用の枠組みを引く", why: "Brandri の用語からガイドライン論を辿る。", href: "#entries" },
      ],
    };
    if (s >= 60) return {
      note: "偏った柱の立て直しに、フェーズ別の論点と事例が効きます。",
      items: [
        { kind: "読み物", title: "事業フェーズごとに、ブランディングで考えること。", why: "今の柱の凹みは、フェーズ不一致が原因のことが多い。", href: "#knowledge" },
        { kind: "事例",   title: "Forecast Inc. — 採用と事業の一貫", why: "採用と事業の柱が連動する例。連想・一貫性の参考。", href: "#cases" },
        { kind: "次の問い", title: "課題から論点を引き直す", why: "9つの課題から、自社の凹みに近いものを探す。", href: "#entries" },
      ],
    };
    if (s >= 40) return {
      note: "個別活動を「エクイティとして積む」発想への切替が次の壁です。",
      items: [
        { kind: "読み物", title: "ブランドとマーケティングは、どこで分かれ、どこで重なるのか。", why: "判断主体の違いが、積み上がるかどうかの分かれ目。", href: "#knowledge" },
        { kind: "事例",   title: "リアリス — 仮説として出すVI", why: "完成品で固めず、市場で更新する設計の好例。", href: "#cases" },
        { kind: "次の問い", title: "Highliteの思想を読む", why: "「定義を切り分ける」「判断を書く」の編集姿勢。", href: "#philosophy" },
      ],
    };
    return {
      note: "まずは語彙と判断軸を揃えましょう。Brandri の「歩き方」が最短です。",
      items: [
        { kind: "入口",   title: "ブランディング、まずはここから。", why: "60秒で現在地を測る。学習地形図と次の3歩を提示。", href: "start.html" },
        { kind: "読み物", title: "ブランドとマーケティングは、どこで分かれ、どこで重なるのか。", why: "最初に整理すべき定義論。", href: "#knowledge" },
        { kind: "事例",   title: "リアリス — スタートアップのスピード設計", why: "判断基準を仮説として出す入門例。", href: "#cases" },
      ],
    };
  };

  if (done) {
    const g = grade(totalScore);
    return (
      <div className="diag-grid">
        <div className="diag-intro">
          <div className="aaker-badge">
            <span className="aaker-label">Framework</span>
            <span className="aaker-name">David A. Aaker</span>
            <span className="aaker-sub">Brand Equity Model<br/>5 Pillars</span>
          </div>
          <h3>診断結果</h3>
          <p>D・アーカー教授の「ブランドエクイティ」概念に基づき、5つの柱それぞれを評価しています。総合点は5柱の平均値として算出。</p>
          <div className="stat">
            Methodology · Aaker (1991, 1996)<br />
            Calibration · Highlite editorial<br />
            Result · {new Date().toLocaleDateString("ja-JP")}
          </div>
        </div>
        <div className="diag-card">
          <div className="diag-result show">
            <div className="result-label">Brand Equity · Total Stars</div>
            <div className="result-score num-optima">
              <CountUp to={totalStars} duration={1800} />
              <span className="of"> / {maxStars}</span>
            </div>
            <div className="result-grade">— {g.g} / {g.ja} —</div>
            <div className="result-msg">{g.msg}</div>

            <div className="pillars-block">
              <div className="pillars-head">
                <span>Five Pillars</span>
                <span>D. Aaker</span>
              </div>
              {questions.map((q, i) => (
                <div className="pillar-row" key={q.pillarNum} style={{ animationDelay: (0.3 + i * 0.12) + "s" }}>
                  <div className="pillar-num num-optima">{q.pillarNum}</div>
                  <div className="pillar-label">
                    <div className="pillar-en">{q.pillar}</div>
                    <div className="pillar-ja">{q.pillarJa}</div>
                  </div>
                  <StarRating count={pillarStars[i]} max={5} delay={700 + i * 200} />
                  <div className="pillar-score num-optima">
                    <CountUp to={pillarStars[i]} duration={900} delay={700 + i * 200} />
                    <span className="of-stars"> / 5</span>
                  </div>
                </div>
              ))}
            </div>

            {(() => {
              const r = recommend(totalScore);
              return (
                <div className="diag-recommend">
                  <div className="dr-head">
                    <div className="dr-label">▸ Highlite Note — 次の3本</div>
                    <p className="dr-note">{r.note}</p>
                  </div>
                  <div className="dr-list">
                    {r.items.map((it, i) => (
                      <a key={i} href={it.href} className="dr-card">
                        <div className="dr-kind">{it.kind}</div>
                        <div className="dr-title">{it.title}</div>
                        <div className="dr-why">{it.why}</div>
                        <div className="dr-go">続きを見る →</div>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* リード獲得 — チェックリストPDF と引き換えにメール取得 */}
            <LeadGate />

            {/* 相談オファー併置 — spec 001 FR-021: 診断結果に個別相談オファーを併置する */}
            <div className="diag-offer">
              <div className="do-head">
                <span className="do-label">Consultation Offer</span>
                <span className="do-free">初回 · 無料</span>
              </div>
              <p className="do-lede">
                この診断結果を持ち込んで、判断の枠組みを一緒に整理しませんか。
                5つの柱のうち<em>最も低い柱</em>から立て直しの順序を設計します。売り込みはありません。
              </p>
              <div className="result-actions">
                <a className="btn" href="https://highlite.co.jp/contact/" target="_blank" rel="noopener">この結果をもとに相談する →</a>
                <button className="btn ghost" onClick={restart}>もう一度診断する</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[step];
  const answered = answers[step] !== null;
  const answeredCount = answers.filter(a => a !== null).length;

  return (
    <div className="diag-grid">
      <div className="diag-intro">
        <div className="aaker-badge">
          <span className="aaker-label">Framework</span>
          <span className="aaker-name">David A. Aaker</span>
          <span className="aaker-sub">Brand Equity Model<br/>5 Pillars</span>
        </div>
        <h3>5問で測る<br />ブランドエクイティ。</h3>
        <p>
          D・アーカーが提唱した「ブランドエクイティ」5柱（認知 / ロイヤルティ / 連想 / 知覚品質 / 資産）を、
          5つの問いで自社に当てはめます。答えに正解はありません。現状に近い選択肢を直感で。
        </p>
        <div className="stat">
          Pillars · 05<br />
          Estimated · 約2分<br />
          Data · 匿名・送信なし
        </div>
      </div>

      <div className="diag-card" key={"step-" + step}>
        <div className="diag-step-row">
          <div className="diag-step num-optima">Question — {String(step+1).padStart(2,"0")} / {String(questions.length).padStart(2,"0")}</div>
          <div className="diag-pillar-tag">
            <span className="num-optima">{q.pillarNum}</span>
            <span>{q.pillar} <em>· {q.pillarJa}</em></span>
          </div>
        </div>
        <h4 className="diag-q">{q.q}</h4>
        <p className="diag-note">{q.note}</p>
        <div className="diag-options">
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={"diag-option" + (answers[step] === i ? " selected" : "")}
              onClick={() => pick(i)}
            >
              <span className="opt-key num-optima">{String.fromCharCode(65 + i)}.</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>

        <div className="diag-controls">
          <button className="btn ghost" onClick={back} disabled={step === 0}>← 戻る</button>
          <div className="diag-progress">
            <div className="bar" style={{ width: ((answeredCount / questions.length) * 100) + "%" }}></div>
          </div>
          <button className="btn" onClick={forward} disabled={!answered}>
            {step === questions.length - 1 ? "結果を見る" : "次へ →"}
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("diagnostic-app")).render(<Diagnostic />);

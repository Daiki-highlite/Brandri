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
    if (step < questions.length - 1) setStep(step + 1);
    else setDone(true);
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

  if (done) {
    const g = grade(totalScore);
    return (
      <div className="diag-grid">
        <div className="diag-intro">
          <div className="aaker-badge">
            <span className="aaker-label">FRAMEWORK</span>
            <span className="aaker-name">David A. Aaker</span>
            <span className="aaker-sub">Brand Equity Model<br/>5 Pillars</span>
          </div>
          <h3>診断結果</h3>
          <p>D・アーカー教授の「ブランドエクイティ」概念に基づき、5つの柱それぞれを評価しています。総合点は5柱の平均値として算出。</p>
          <div className="stat">
            METHODOLOGY · Aaker (1991, 1996)<br />
            CALIBRATION · Highlite editorial<br />
            RESULT · {new Date().toLocaleDateString("ja-JP")}
          </div>
        </div>
        <div className="diag-card">
          <div className="diag-result show">
            <div className="result-label">BRAND EQUITY · TOTAL STARS</div>
            <div className="result-score num-optima">
              <CountUp to={totalStars} duration={1800} />
              <span className="of"> / {maxStars}</span>
            </div>
            <div className="result-grade">— {g.g} / {g.ja} —</div>
            <div className="result-msg">{g.msg}</div>

            <div className="pillars-block">
              <div className="pillars-head">
                <span>FIVE PILLARS</span>
                <span>D. AAKER</span>
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

            <div className="result-actions">
              <button className="btn">詳細な相談に進む</button>
              <button className="btn ghost" onClick={restart}>もう一度診断する</button>
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
          <span className="aaker-label">FRAMEWORK</span>
          <span className="aaker-name">David A. Aaker</span>
          <span className="aaker-sub">Brand Equity Model<br/>5 Pillars</span>
        </div>
        <h3>5問で測る<br />ブランドエクイティ。</h3>
        <p>
          D・アーカーが提唱した「ブランドエクイティ」5柱（認知 / ロイヤルティ / 連想 / 知覚品質 / 資産）を、
          5つの問いで自社に当てはめます。答えに正解はありません。現状に近い選択肢を直感で。
        </p>
        <div className="stat">
          PILLARS · 05<br />
          ESTIMATED · 約2分<br />
          DATA · 匿名・送信なし
        </div>
      </div>

      <div className="diag-card" key={"step-" + step}>
        <div className="diag-step-row">
          <div className="diag-step num-optima">QUESTION — {String(step+1).padStart(2,"0")} / {String(questions.length).padStart(2,"0")}</div>
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

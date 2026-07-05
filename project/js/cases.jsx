// Cases — Highlite Inc. の公式実績（https://highlite.co.jp/work/）を一覧表示。
// 各行は当該案件の公式ページへ、写真は同社公式サイトの実写真を自社ホストして使用。
const { useState: useStateCase, useRef: useRefCase, useEffect: useEffectCase } = React;

function Cases() {
  const [hover, setHover] = useStateCase(null);
  const [pos, setPos] = useStateCase({ x: 0, y: 0 });
  const cases = window.BRANDRI_CASES;

  useEffectCase(() => {
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // clamp preview within viewport
  const previewStyle = (() => {
    if (!hover) return { opacity: 0 };
    const w = 300, h = 380;
    const pad = 24;
    let x = pos.x + 220; // offset to the right
    let y = pos.y;
    if (x + w/2 > window.innerWidth - pad) x = window.innerWidth - pad - w/2;
    if (x - w/2 < pad) x = pad + w/2;
    if (y - h/2 < pad + 80) y = pad + 80 + h/2;
    if (y + h/2 > window.innerHeight - pad) y = window.innerHeight - pad - h/2;
    return { left: x + "px", top: y + "px" };
  })();

  return (
    <>
      <div className="case-list reveal">
        {cases.map((c, i) => (
          <a
            className="case-row"
            key={c.num}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="case-row-head">
              <div
                className="c-thumb"
                style={{ backgroundImage: `url('${c.photo}')` }}
                aria-hidden="true"
              >
                <span className="ct-num">№ {c.num}</span>
              </div>
              <div className="c-client">
                <span className="c-cat">{c.cat}</span>
                {c.client}
              </div>
              <div className="c-title">— {c.title}</div>
              <div className="c-year">{c.year}</div>
              <div className="c-arrow">›</div>
            </div>
            {c.excerpt && (
              <div className="c-point">
                <div className="c-point-label">▸ Overview</div>
                <p>{c.excerpt}</p>
              </div>
            )}
          </a>
        ))}
      </div>

      <div
        className={"case-preview" + (hover ? " show" : "")}
        style={previewStyle}
      >
        {hover && (
          <>
            <div
              className="cp-img"
              style={{ backgroundImage: `url('${hover.photo}')` }}
            >
              <div style={{
                position:"absolute", bottom:12, left:14, right:14,
                color:"#FAF6EC", fontFamily:"var(--mono)", fontSize:10,
                letterSpacing:"0.1em", display:"flex", justifyContent:"space-between"
              }}>
                <span>CASE № {hover.num}</span>
                <span>{hover.year}</span>
              </div>
            </div>
            <div className="cp-body">
              <div className="cp-cat">{hover.cat.toUpperCase()}</div>
              <div className="cp-title">{hover.client} — {hover.title.slice(0, 20)}{hover.title.length > 20 ? "…" : ""}</div>
              <div className="cp-excerpt">{hover.excerpt}</div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("cases-app")).render(<Cases />);

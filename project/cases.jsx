// Cases — list with hover preview card
const { useState: useStateCase, useRef: useRefCase, useEffect: useEffectCase } = React;

// SVG pattern generator for preview thumbnails
function patternBg(pattern, color) {
  const bg = color;
  let svg = "";
  const fg = "rgba(250,246,236,0.25)";
  if (pattern === "diagonal") {
    svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>
      <rect width='40' height='40' fill='${bg}'/>
      <path d='M0 40 L40 0 M-10 10 L10 -10 M30 50 L50 30' stroke='${fg}' stroke-width='1.5'/>
    </svg>`;
  } else if (pattern === "dots") {
    svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'>
      <rect width='28' height='28' fill='${bg}'/>
      <circle cx='14' cy='14' r='2' fill='${fg}'/>
    </svg>`;
  } else if (pattern === "lines") {
    svg = `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'>
      <rect width='8' height='8' fill='${bg}'/>
      <path d='M0 4 L8 4' stroke='${fg}' stroke-width='1'/>
    </svg>`;
  } else {
    svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>
      <rect width='24' height='24' fill='${bg}'/>
      <path d='M0 0 L24 0 M0 0 L0 24' stroke='${fg}' stroke-width='1'/>
    </svg>`;
  }
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

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
          <div
            className="case-row"
            key={c.num}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="case-row-head">
              <div className="c-num">№ {c.num}</div>
              <div className="c-client">
                <span className="c-cat">{c.cat}</span>
                {c.client}
              </div>
              <div className="c-title">— {c.title}</div>
              <div className="c-year">{c.year}</div>
              <div className="c-arrow">›</div>
            </div>
            {c.point && (
              <div className="c-point">
                <div className="c-point-label">▸ Highlite Point</div>
                <p dangerouslySetInnerHTML={{ __html: c.point }} />
              </div>
            )}
          </div>
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
              style={{
                backgroundImage: patternBg(hover.pattern, hover.color),
              }}
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

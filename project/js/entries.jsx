// Entries — 3 tabs: 課題 / フェーズ / 用語
const { useState, useMemo, useRef, useEffect } = React;

function Entries() {
  const [domain, setDomain] = useState("corporate");
  const [tab, setTab] = useState("issues");
  const [query, setQuery] = useState("");
  const data = window.BRANDRI_DATA;

  // 最上段: コーポレート / 事業 の2区分。各項目の domain（corporate/business/both）で絞り込む。
  const domains = [
    { id: "corporate", ja: "コーポレートブランディング", en: "Corporate Branding", desc: "企業ブランド — 採用・社内浸透・全社の一貫性・上場準備" },
    { id: "business",  ja: "事業ブランディング",       en: "Business Branding",  desc: "事業・製品ブランド — 差別化・新規事業・市場での立ち位置" },
  ];

  const tabs = [
    { id: "issues", num: "A", ja: "課題から探す", en: "By Issue" },
    { id: "phases", num: "B", ja: "フェーズから探す", en: "By Phase" },
    { id: "terms",  num: "C", ja: "用語から探す", en: "By Term" },
  ];

  const inDomain = (i) => i.domain === domain || i.domain === "both";
  const current = data[tab].filter(inDomain);
  const filtered = useMemo(() => {
    if (!query.trim()) return current;
    const q = query.toLowerCase();
    return current.filter(i =>
      i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)
    );
  }, [query, current]);

  const placeholder = {
    issues: "例: 採用 / 値引き / 新規事業",
    phases: "例: PMF後 / 上場 / 海外展開",
    terms:  "例: MVV / ポジショニング / トーン",
  }[tab];

  return (
    <div>
      <div className="entry-domains reveal">
        {domains.map(dm => (
          <button
            key={dm.id}
            className={"entry-domain" + (domain === dm.id ? " active" : "")}
            onClick={() => { setDomain(dm.id); setQuery(""); }}
          >
            <div className="dm-ja">{dm.ja}</div>
            <div className="dm-en">{dm.en}</div>
            <div className="dm-desc">{dm.desc}</div>
          </button>
        ))}
      </div>

      <div className="entry-tabs reveal">
        {tabs.map(t => (
          <button
            key={t.id}
            className={"entry-tab" + (tab === t.id ? " active" : "")}
            onClick={() => { setTab(t.id); setQuery(""); }}
          >
            <span className="tab-num">Entry · {t.num}</span>
            <div className="tab-ja">{t.ja}</div>
            <div className="tab-en">— {t.en}</div>
          </button>
        ))}
      </div>

      <div className="entry-search reveal delay-1">
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="count">{String(filtered.length).padStart(2,"0")} / {String(current.length).padStart(2,"0")}</span>
      </div>

      <div className="entry-results">
        {filtered.map((item, i) => (
          <a className="entry-item" key={item.num + item.title} href={item.href}>
            <span className="item-num">{tab === "terms" ? `— ${item.num} —` : `№ ${item.num}`}</span>
            <div className="item-title">{item.title}</div>
            <div className="item-desc">{item.desc}</div>
            <div className="item-arrow">Read →</div>
          </a>
        ))}
        {filtered.length === 0 && (
          <div className="entry-item" style={{gridColumn:"1/-1", alignItems:"center", justifyContent:"center", textAlign:"center"}}>
            <div className="item-desc" style={{color:"var(--ink-mute)", fontFamily:"var(--mono)", fontSize:12}}>
              — No matches — 別のキーワードでお試しください
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("entries-app")).render(<Entries />);

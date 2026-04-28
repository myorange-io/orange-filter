// Header, Sidebar, ProposalCard, ProposalComposer, PricingCard
// eslint-disable-next-line no-undef
const { useState } = React;

function Header({ route, onNav }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 10,
      height: 64, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid #E5E5E5",
      display: "flex", alignItems: "center", padding: "0 24px", gap: 20,
    }}>
      <a href="#/dashboard" onClick={e => { e.preventDefault(); onNav("dashboard"); }} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
        <img src="../../assets/logos/orangeimpact.svg" alt="orangeimpact" style={{ height: 24, display: "block" }} />
      </a>
      <Chip tone="brandTint" size="sm" style={{ marginLeft: 4 }}>ver 2.0</Chip>
      <nav style={{ marginLeft: 32, display: "flex", gap: 4 }}>
        {[["dashboard", "대시보드"], ["composer", "제안서 작성"], ["pricing", "플랜"]].map(([k, label]) => (
          <a key={k} href={`#/${k}`} onClick={e => { e.preventDefault(); onNav(k); }} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            color: route === k ? "#0A0A0A" : "#525252",
            background: route === k ? "#FFF2E7" : "transparent",
            textDecoration: "none",
          }}>{label}</a>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E5E5E5", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#525252" }}><Icon name="bell" size={18} /></button>
        <button style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E5E5E5", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#525252" }}><Icon name="help" size={18} /></button>
        <div style={{ width: 36, height: 36, borderRadius: 999, background: "linear-gradient(135deg,#FF8129,#FF6F1F)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, marginLeft: 4 }}>김</div>
      </div>
    </header>
  );
}

function Sidebar({ active, onNav }) {
  const items = [
    { k: "dashboard", icon: "home", label: "대시보드" },
    { k: "proposals", icon: "file", label: "내 제안서", count: 12 },
    { k: "templates", icon: "folder", label: "템플릿" },
    { k: "team", icon: "users", label: "팀" },
    { k: "settings", icon: "settings", label: "설정" },
  ];
  return (
    <aside style={{ width: 240, borderRight: "1px solid #E5E5E5", padding: "24px 12px", display: "flex", flexDirection: "column", gap: 2, background: "#FAFAFA" }}>
      <div style={{ padding: "4px 10px 12px", fontSize: 11, fontWeight: 700, color: "#737373", letterSpacing: "0.031em" }}>행복즐거움조이개발센터</div>
      {items.map(i => (
        <button key={i.k} onClick={() => onNav && onNav(i.k)} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
          background: active === i.k ? "#FFF2E7" : "transparent",
          color: active === i.k ? "#C44312" : "#404040",
          border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: active === i.k ? 700 : 500, textAlign: "left",
        }}>
          <Icon name={i.icon} size={18} />
          <span style={{ flex: 1 }}>{i.label}</span>
          {i.count && <span style={{ fontSize: 11, color: "#737373", fontWeight: 700 }}>{i.count}</span>}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: 16, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Chip tone="brandTint" size="sm" style={{ alignSelf: "flex-start" }}>Free 플랜</Chip>
        <div style={{ fontSize: 13, color: "#525252", lineHeight: 1.5 }}>이번 달 7 / 10개 생성</div>
        <div style={{ height: 4, borderRadius: 999, background: "#F0F0F0", overflow: "hidden" }}><div style={{ width: "70%", height: "100%", background: "#FF6F1F" }} /></div>
        <Button size="sm" variant="primary" style={{ alignSelf: "stretch", justifyContent: "center" }}>업그레이드</Button>
      </div>
    </aside>
  );
}

function ProposalCard({ title, org, status, updated, words }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      background: "#fff", border: `1px solid ${hover ? "#D4D4D4" : "#E5E5E5"}`,
      borderRadius: 12, padding: 20, boxShadow: hover ? "0 8px 24px rgb(10 10 10 / 0.08)" : "0 2px 6px rgb(10 10 10 / 0.06)",
      display: "flex", flexDirection: "column", gap: 12, cursor: "pointer",
      transition: "box-shadow 150ms, border-color 150ms",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: "#FFF2E7", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF6F1F" }}><Icon name="file" size={20} /></div>
        <Chip tone={status === "초안" ? "neutral" : status === "검토 중" ? "accentTint" : "brandTint"} size="sm">{status}</Chip>
      </div>
      <div>
        <h4 style={{ fontSize: 18, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.4, marginBottom: 4 }}>{title}</h4>
        <p style={{ fontSize: 13, color: "#525252", lineHeight: 1.5 }}>{org}</p>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#737373", letterSpacing: "0.031em", marginTop: "auto", paddingTop: 12, borderTop: "1px solid #F0F0F0" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={12} />{updated}</span>
        <span>·</span>
        <span style={{ fontFeatureSettings: "'tnum' 1" }}>{words.toLocaleString()} 단어</span>
      </div>
    </div>
  );
}

function ProposalComposer() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", text: "안녕하세요. 어떤 사업 제안서를 작성하시나요? 사업 목표를 간단히 알려주세요." },
  ]);
  const send = () => {
    if (!prompt.trim()) return;
    setMessages(m => [...m, { role: "user", text: prompt }, { role: "ai", text: "좋습니다. 자연 생태계 복원 사업의 핵심 메시지를 아래에 초안으로 정리했습니다. 오른쪽 캔버스에서 확인해 주세요." }]);
    setPrompt("");
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 0, height: "calc(100vh - 64px)" }}>
      {/* Canvas */}
      <div style={{ padding: "32px 48px", overflow: "auto", background: "#FFFFFF" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Chip tone="brandTint">초안 · AI 생성</Chip>
            <span style={{ fontSize: 11, color: "#737373", letterSpacing: "0.031em" }}>3시간 전 저장</span>
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 700, color: "#0A0A0A", lineHeight: 1, letterSpacing: "-0.5px" }}>자연 생태계 복원<br/>3개년 사업 계획</h1>
          <p style={{ fontSize: 18, color: "#525252", lineHeight: 1.6 }}>자연 생태계의 회복과 종다양성의 파괴를 막기 위한 체계적인 복원 사업을 추진합니다. 본 제안서는 2026년부터 2028년까지의 중장기 계획을 담고 있습니다.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, padding: "20px 0", borderTop: "1px solid #E5E5E5", borderBottom: "1px solid #E5E5E5" }}>
            {[["사업 기간", "3년"], ["대상 지역", "강원·경북"], ["수혜자", "44,716명"]].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 11, color: "#737373", letterSpacing: "0.031em", marginBottom: 4 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, color: "#0A0A0A", fontFeatureSettings: "'tnum' 1" }}>{v}</div></div>
            ))}
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.3, marginTop: 12 }}>사업 배경</h2>
          <p style={{ fontSize: 16, color: "#262626", lineHeight: 1.7 }}>기후 변화와 무분별한 개발로 인해 국내 생물 종 다양성이 급속히 감소하고 있습니다. 본 사업은 훼손된 서식지를 단계적으로 복원하고, 지역 주민과 함께 장기적인 보전 체계를 구축하는 것을 목표로 합니다.</p>
          <div style={{ padding: 16, background: "#FFF2E7", borderRadius: 12, border: "1px solid #FFE8D7", display: "flex", gap: 10 }}>
            <Icon name="sparkles" size={18} color="#C44312" />
            <div><div style={{ fontSize: 13, fontWeight: 700, color: "#C44312", marginBottom: 2 }}>AI 제안</div><div style={{ fontSize: 13, color: "#404040", lineHeight: 1.5 }}>"사업 배경"에 최근 3년간 서식지 감소 통계를 인용하면 설득력이 높아집니다. 추가하시겠어요?</div></div>
          </div>
        </div>
      </div>
      {/* AI panel */}
      <div style={{ borderLeft: "1px solid #E5E5E5", background: "#FAFAFA", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkles" size={18} color="#FF6F1F" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A" }}>AI 어시스턴트</span>
        </div>
        <div style={{ flex: 1, padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%",
              padding: "10px 14px", borderRadius: 12,
              background: m.role === "user" ? "#FF6F1F" : "#fff",
              color: m.role === "user" ? "#fff" : "#262626",
              fontSize: 14, lineHeight: 1.5,
              border: m.role === "user" ? "none" : "1px solid #E5E5E5",
            }}>{m.text}</div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #E5E5E5", background: "#fff" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {["배경 보강", "예산표 생성", "톤 정중하게"].map(s => (
              <button key={s} onClick={() => setPrompt(s)} style={{ border: "1px solid #E5E5E5", background: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 500, color: "#525252", cursor: "pointer" }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="무엇을 도와드릴까요?" rows={2}
              style={{ flex: 1, resize: "none", fontFamily: "inherit", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid #D4D4D4", outline: "none", lineHeight: 1.5, color: "#262626" }} />
            <Button variant="primary" size="md" onClick={send} icon="send">보내기</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingCard({ plan, price, period, features, featured, cta }) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${featured ? "#FF6F1F" : "#E5E5E5"}`,
      boxShadow: featured ? "0 8px 24px rgb(255 111 31 / 0.12), inset 0 0 0 1px #FF6F1F" : "0 2px 6px rgb(10 10 10 / 0.06)",
      borderRadius: 16, padding: 32,
      display: "flex", flexDirection: "column", gap: 16,
      position: "relative",
    }}>
      {featured && <div style={{ position: "absolute", top: -12, left: 24 }}><Chip tone="brand" size="md">가장 인기</Chip></div>}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#FF6F1F", letterSpacing: "0.031em", marginBottom: 8 }}>{plan}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#0A0A0A", letterSpacing: "-0.5px", lineHeight: 1, fontFeatureSettings: "'tnum' 1" }}>{price}</span>
          <span style={{ fontSize: 14, color: "#737373" }}>{period}</span>
        </div>
      </div>
      <div style={{ height: 1, background: "#E5E5E5" }} />
      <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
        {features.map(f => (
          <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#262626" }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "#FFF2E7", color: "#FF6F1F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={12} strokeWidth={2.5} /></span>
            {f}
          </li>
        ))}
      </ul>
      <div style={{ flex: 1 }} />
      <Button variant={featured ? "primary" : "secondary"} size="lg" style={{ justifyContent: "center" }}>{cta}</Button>
    </div>
  );
}

Object.assign(window, { Header, Sidebar, ProposalCard, ProposalComposer, PricingCard });

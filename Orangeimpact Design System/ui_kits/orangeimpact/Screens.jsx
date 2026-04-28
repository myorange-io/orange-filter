// Screen containers — Dashboard, Pricing (Composer is in Components.jsx)
// eslint-disable-next-line no-undef

function Dashboard({ onNav }) {
  const proposals = [
    { title: "자연 생태계 복원 3개년 사업 계획", org: "환경재단 그린임팩트", status: "초안", updated: "3시간 전", words: 12480 },
    { title: "청소년 디지털 리터러시 교육 프로그램", org: "행복즐거움조이개발센터", status: "검토 중", updated: "어제", words: 8932 },
    { title: "고령층 디지털 격차 해소 사업", org: "서울시 복지재단", status: "제출 완료", updated: "3일 전", words: 15640 },
    { title: "도시재생 커뮤니티 플랫폼", org: "마을만들기협동조합", status: "초안", updated: "5일 전", words: 4120 },
    { title: "장애 예술가 창작 지원", org: "문화다양성포럼", status: "검토 중", updated: "1주 전", words: 11205 },
    { title: "농촌 청년 창업 인큐베이팅", org: "지역혁신센터", status: "제출 완료", updated: "2주 전", words: 18072 },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 64px)" }}>
      <Sidebar active="dashboard" />
      <div style={{ overflow: "auto", padding: "32px 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#737373", letterSpacing: "0.031em", marginBottom: 6, fontWeight: 700 }}>대시보드</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.3 }}>안녕하세요, 김지현 님</h1>
            <p style={{ fontSize: 16, color: "#525252", marginTop: 6 }}>오늘도 더 설득력 있는 제안서를 함께 완성해요.</p>
          </div>
          <Button variant="primary" size="lg" icon="plus" onClick={() => onNav("composer")}>새 제안서</Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { k: "진행 중", v: "12", tone: "#FF6F1F" },
            { k: "검토 대기", v: "3", tone: "#0075FF" },
            { k: "이번 달 제출", v: "5", tone: "#0A0A0A" },
            { k: "누적 단어 수", v: "44,716", tone: "#0A0A0A" },
          ].map(s => (
            <div key={s.k} style={{ background: "#fff", border: "1px solid #E5E5E5", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: "#737373", letterSpacing: "0.031em", fontWeight: 700, marginBottom: 8 }}>{s.k}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.tone, lineHeight: 1, letterSpacing: "-0.2px", fontFeatureSettings: "'tnum' 1" }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0A0A0A" }}>최근 제안서</h2>
          <a href="#" style={{ fontSize: 13, color: "#FF6F1F", fontWeight: 700, textDecoration: "none" }}>모두 보기 →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16, paddingBottom: 48 }}>
          {proposals.map((p, i) => <ProposalCard key={i} {...p} />)}
        </div>
      </div>
    </div>
  );
}

function Pricing() {
  return (
    <div style={{ padding: "64px 48px", background: "linear-gradient(#FFFFFF 0%, #FFF8F3 100%)", minHeight: "calc(100vh - 64px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <Chip tone="brandTint" style={{ marginBottom: 16 }}>플랜</Chip>
          <h1 style={{ fontSize: 48, fontWeight: 700, color: "#0A0A0A", lineHeight: 1, letterSpacing: "-0.5px", marginBottom: 12 }}>플랜 상세 비교</h1>
          <p style={{ fontSize: 18, color: "#525252", lineHeight: 1.6 }}>플랜 상세 비교입니다. 단체의 규모에 맞는 플랜을 선택하세요.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          <PricingCard plan="FREE" price="₩0" period="/ 월" cta="현재 사용 중" features={["월 10개 제안서 생성", "기본 AI 어시스턴트", "2GB 저장 공간", "이메일 지원"]} />
          <PricingCard featured plan="PRO" price="₩49,000" period="/ 월" cta="Pro 시작하기" features={["무제한 제안서 생성", "고급 AI 어시스턴트", "팀 협업 (5명)", "50GB 저장 공간", "우선 지원"]} />
          <PricingCard plan="ORGANIZATION" price="문의" period="" cta="영업팀 문의" features={["무제한 사용자", "전용 인프라", "SSO · 감사 로그", "전담 CSM", "맞춤 학습"]} />
        </div>
        <div style={{ marginTop: 48, padding: 24, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 12, display: "flex", alignItems: "center", gap: 16 }}>
          <Icon name="help" size={24} color="#0075FF" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A", marginBottom: 4 }}>비영리 단체 할인</div>
            <div style={{ fontSize: 14, color: "#525252" }}>공익법인 및 사회적기업은 Pro 플랜을 40% 할인된 가격으로 이용하실 수 있습니다.</div>
          </div>
          <Button variant="secondary">할인 신청</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Pricing });

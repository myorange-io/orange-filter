// Shared primitives — Button, Chip, Field, Icon
// eslint-disable-next-line no-undef
const { useState } = React;

function Icon({ name, size = 20, color = "currentColor", strokeWidth = 1.75, style = {} }) {
  // Minimal inline SVG icon set matching Lucide style (1.75 stroke, round caps)
  const icons = {
    sparkles: (<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M18 18l-2.5-2.5M6 18l2.5-2.5M18 6l-2.5 2.5"/></>),
    send: (<><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></>),
    plus: (<><path d="M12 5v14M5 12h14"/></>),
    search: (<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>),
    folder: (<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>),
    file: (<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/></>),
    users: (<><circle cx="9" cy="8" r="4"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M22 21v-1a5 5 0 0 0-4-4.9"/></>),
    settings: (<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.25 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
    check: (<path d="M20 6L9 17l-5-5"/>),
    chevronDown: (<path d="M6 9l6 6 6-6"/>),
    arrowRight: (<><path d="M5 12h14M13 5l7 7-7 7"/></>),
    edit: (<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>),
    clock: (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
    bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>),
    help: (<><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></>),
    home: (<><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2V10z"/></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      {icons[name] || null}
    </svg>
  );
}

function Button({ children, variant = "primary", size = "md", icon, onClick, disabled, style = {}, type = "button" }) {
  const sizes = { sm: { padding: "6px 12px", fontSize: 12 }, md: { padding: "10px 18px", fontSize: 14 }, lg: { padding: "14px 22px", fontSize: 16 } };
  const variants = {
    primary: { background: "#FF6F1F", color: "#fff", border: "1px solid transparent" },
    secondary: { background: "#fff", color: "#404040", border: "1px solid #D4D4D4" },
    ghost: { background: "transparent", color: "#404040", border: "1px solid transparent" },
    accent: { background: "#0075FF", color: "#fff", border: "1px solid transparent" },
  };
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const v = variants[variant];
  let bg = v.background;
  if (variant === "primary") bg = press ? "#E65317" : hover ? "#FF5F1A" : "#FF6F1F";
  if (variant === "secondary" && hover) bg = "#FAFAFA";
  if (variant === "ghost" && hover) bg = "#FAFAFA";
  if (variant === "accent" && hover) bg = "#006AE8";
  if (disabled) { bg = "#F0F0F0"; }
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontFamily: "inherit", fontWeight: 700, lineHeight: 1.2,
        borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 150ms cubic-bezier(.2,0,0,1)",
        ...sizes[size], ...v, background: bg,
        color: disabled ? "#A3A3A3" : v.color,
        borderColor: disabled ? "#E5E5E5" : v.border.split(" ")[2],
        ...style,
      }}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

function Chip({ children, tone = "neutral", size = "md", style = {} }) {
  const tones = {
    brand: { background: "#FF6F1F", color: "#fff" },
    brandTint: { background: "#FFF2E7", color: "#C44312" },
    accentTint: { background: "#E6F1FF", color: "#00408C" },
    neutral: { background: "#F0F0F0", color: "#404040" },
    outline: { background: "#fff", color: "#404040", border: "1px solid #D4D4D4" },
  };
  const sizes = { sm: { padding: "4px 10px", fontSize: 11 }, md: { padding: "6px 14px", fontSize: 12 } };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      borderRadius: 999, fontWeight: 700, lineHeight: 1.2,
      ...sizes[size], ...tones[tone], ...style,
    }}>{children}</span>
  );
}

function Field({ label, helper, error, children, required }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#262626" }}>{label}{required && <span style={{ color: "#FF6F1F" }}> *</span>}</span>
      {children}
      {(helper || error) && <span style={{ fontSize: 12, color: error ? "#C44312" : "#737373" }}>{error || helper}</span>}
    </label>
  );
}

function Input({ value, onChange, placeholder, error, disabled, style = {} }) {
  const [focus, setFocus] = useState(false);
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        fontFamily: "inherit", fontSize: 14, color: "#262626",
        padding: "10px 12px", borderRadius: 8, outline: "none",
        background: disabled ? "#FAFAFA" : "#fff",
        border: `1px solid ${error ? "#C44312" : focus ? "#FF6F1F" : "#D4D4D4"}`,
        boxShadow: focus ? "0 0 0 3px rgb(255 212 179 / 0.6)" : "none",
        transition: "border-color 150ms, box-shadow 150ms",
        ...style,
      }} />
  );
}

Object.assign(window, { Icon, Button, Chip, Field, Input });

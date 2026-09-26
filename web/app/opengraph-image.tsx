import { ImageResponse } from "next/og";

export const alt = "Leash — onchain firewall for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const verdicts = [
  { label: "EXECUTED", sub: "within policy", color: "#2bff88" },
  { label: "BLOCKED", sub: "recorded onchain", color: "#ff4d5e" },
  { label: "NEEDS APPROVAL", sub: "owner signs", color: "#ffb224" },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#050807",
          backgroundImage: "radial-gradient(circle at 10% 0%, rgba(43,255,136,0.20), rgba(5,8,7,0) 55%)",
          color: "#e8efeb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
            <path d="M16 2.5 5 6.8v8.1c0 6.7 4.6 12 11 14.6 6.4-2.6 11-7.9 11-14.6V6.8L16 2.5z" fill="rgba(43,255,136,0.14)" stroke="#2bff88" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M16 8.2a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z" stroke="#2bff88" strokeWidth="1.8" />
            <path d="M16 14.6c0 2.2-2.6 2.9-2.6 5.2 0 1.6 1.2 2.6 2.6 2.6" stroke="#2bff88" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="23.4" r="1.6" fill="#2bff88" />
          </svg>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>Leash</div>
          <div
            style={{
              marginLeft: 12,
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: 22,
              color: "#a1ada7",
            }}
          >
            Base Sepolia
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>
            An onchain firewall wallet for AI agents
          </div>
          <div style={{ fontSize: 30, color: "#a1ada7", maxWidth: 1000 }}>
            Even a prompt-injected agent can’t overspend or pay attackers. The vault contract enforces the rules.
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {verdicts.map((v) => (
            <div
              key={v.label}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "16px 24px",
                borderRadius: 16,
                border: `1px solid ${v.color}55`,
                background: `${v.color}14`,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 700, color: v.color }}>{v.label}</div>
              <div style={{ fontSize: 20, color: "#a1ada7" }}>{v.sub}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

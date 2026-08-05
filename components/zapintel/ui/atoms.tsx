"use client";
import type { Classification } from "@/types/zapintel";
import { STATUS_META } from "@/types/zapintel";

export function Badge({ cls }: { cls: Classification }) {
  const { label, color, bg, border } = STATUS_META[cls];
  return (
    <span style={{
      background: bg, border: `1px solid ${border}`, color, borderRadius: 20,
      padding: "2px 11px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block",
    }}>
      {label}
    </span>
  );
}

export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const col = score >= 70 ? "var(--green)" : score >= 45 ? "var(--yellow)" : "var(--red)";
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--brd)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="3"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.24, fontWeight: 700, color: col,
      }}>{score}</span>
    </div>
  );
}

export function UrgencyDot({ urgency }: { urgency: string }) {
  const colors: Record<string, string> = {
    critical: "var(--red)", high: "var(--orange)", medium: "var(--yellow)", low: "var(--dim)",
  };
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: colors[urgency] || "var(--dim)", marginRight: 6, flexShrink: 0,
    }} />
  );
}

export function Stat({ label, value, sub, color = "var(--txt)" }: {
  label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .7, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .7, marginBottom: 12 }}>
      {String(children).toUpperCase()}
    </div>
  );
}

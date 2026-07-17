"use client";

// Dynamic heading indicator: fixed cardinal ring, arrow rotates to the ship's
// heading (0°=N, 90°=E). Centre shows the numeric heading and rate of turn.
export default function Compass({ heading = 0, rot = 0 }) {
  const ticks = [];
  for (let a = 0; a < 360; a += 30) {
    const major = a % 90 === 0;
    ticks.push(
      <line
        key={a}
        x1="50" y1="7" x2="50" y2={major ? "15" : "11"}
        stroke={major ? "#9fbdd6" : "#4d6b84"}
        strokeWidth={major ? 1.6 : 1}
        transform={`rotate(${a} 50 50)`}
      />
    );
  }
  const turning = Math.abs(rot) > 0.05;
  return (
    <div className="compass" title="Ship heading">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="rgba(10,26,42,0.75)" stroke="#1e3a52" strokeWidth="1.5" />
        {ticks}
        <text x="50" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ff7b7b">N</text>
        <text x="76" y="53.5" textAnchor="middle" fontSize="9" fill="#9fbdd6">E</text>
        <text x="50" y="80" textAnchor="middle" fontSize="9" fill="#9fbdd6">S</text>
        <text x="24" y="53.5" textAnchor="middle" fontSize="9" fill="#9fbdd6">W</text>

        {/* heading arrow (bow blue, stern dark red) */}
        <g transform={`rotate(${heading} 50 50)`}>
          <polygon points="50,15 44.5,52 55.5,52" fill="#4db8ff" />
          <polygon points="50,85 44.5,52 55.5,52" fill="#7a2f2f" />
          <circle cx="50" cy="52" r="3" fill="#0a1a2a" stroke="#4db8ff" strokeWidth="1" />
        </g>

        <text x="50" y="49" textAnchor="middle" fontSize="17" fontWeight="700" fill="#eaf4fb" style={{ fontVariantNumeric: "tabular-nums" }}>
          {heading.toFixed(0)}°
        </text>
        <text x="50" y="60" textAnchor="middle" fontSize="6.5" fill={turning ? "#ffcf6b" : "#7fa3bd"} letterSpacing="0.5">
          {turning ? `ROT ${rot > 0 ? "▶" : "◀"} ${Math.abs(rot).toFixed(1)}°/s` : "STEADY"}
        </text>
      </svg>
    </div>
  );
}

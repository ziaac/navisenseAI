"use client";

// Navigation advisor panel: objects detected around the ship plus the single
// recommended SMCP order. Recommending, not steering — the cadet still has to
// give the order themselves (or click Use to prefill it).
const fmtRel = (rel) =>
  rel === 0 ? "ahead" : rel > 0 ? `${rel}° stbd` : `${-rel}° port`;

export default function Advisor({ advisory, onUse }) {
  if (!advisory) return null;
  const rec = advisory.recommendation;
  const objects = (advisory.objects || []).filter((o) => o.risk !== "clear");
  if (!rec && objects.length === 0) return null;

  return (
    <div className="advisor">
      <div className="advisor-title">NAV ADVISOR</div>
      {objects.map((o) => (
        <div key={o.id} className={`advisor-obj risk-${o.risk}`}>
          <span className="dot" />
          <span className="obj-label">{o.label}</span>
          <span className="obj-meta">{o.range_m} m · {fmtRel(o.rel_deg)}</span>
        </div>
      ))}
      {rec && (
        <div className="advisor-rec">
          <div className="rec-reason">{rec.reason}</div>
          <div className="rec-row">
            <span className="rec-order">“{rec.order}”</span>
            <button className="rec-use" onClick={() => onUse?.(rec.order)}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}

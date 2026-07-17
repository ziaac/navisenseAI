"use client";

function Gauge({ label, value, sub }) {
  return (
    <div className="gauge">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

const telegraphLabel = (pct) => {
  const a = Math.abs(pct);
  const dir = pct >= 0 ? "AHEAD" : "ASTERN";
  if (a < 5) return "STOP";
  if (a <= 25) return `DEAD SLOW ${dir}`;
  if (a <= 40) return `SLOW ${dir}`;
  if (a <= 65) return `HALF ${dir}`;
  return `FULL ${dir}`;
};

export default function Instruments({ state }) {
  if (!state) return null;
  const r = state.rudder_deg;
  return (
    <div className="instruments">
      <Gauge label="Heading" value={`${state.heading_deg.toFixed(0)}°`} sub={`ROT ${state.yaw_rate_deg_s.toFixed(1)}°/s`} />
      <Gauge label="Speed" value={state.speed_kn.toFixed(1)} sub="knots" />
      <Gauge
        label="Rudder"
        value={`${Math.abs(r).toFixed(0)}° ${r < -0.5 ? "PORT" : r > 0.5 ? "STBD" : ""}`}
        sub={`ordered ${state.rudder_cmd_deg.toFixed(0)}°`}
      />
      <Gauge label="Telegraph" value={`${state.thrust_pct.toFixed(0)}%`} sub={telegraphLabel(state.thrust_cmd_pct)} />
      <Gauge label="Sim Time" value={`${state.t.toFixed(0)}s`} />
    </div>
  );
}

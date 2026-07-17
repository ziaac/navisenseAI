"use client";
import Compass from "./Compass";

function Gauge({ label, value, sub, subClass, valueClass }) {
  return (
    <div className="gauge">
      <div className="label">{label}</div>
      <div className={`value ${valueClass || ""}`}>{value}</div>
      {sub && <div className={`sub ${subClass || ""}`}>{sub}</div>}
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

const RUDDER_RATE = 5; // deg/s (matches sim rate limit)

export default function Instruments({ state }) {
  if (!state) return null;
  const r = state.rudder_deg;

  // rudder is rate-limited, so time-to-reach is deterministic
  const rudderDiff = Math.abs(state.rudder_cmd_deg - r);
  const rudderSettling = rudderDiff > 0.5;
  const rudderEta = Math.ceil(rudderDiff / RUDDER_RATE);

  // engine has first-order lag (asymptotic) — show remaining gap as progress
  const thrustDiff = Math.abs(state.thrust_cmd_pct - state.thrust_pct);
  const engineSettling = thrustDiff > 1;

  const maneuvering = rudderSettling || engineSettling;

  return (
    <div className="instruments">
      <Compass heading={state.heading_deg} rot={state.yaw_rate_deg_s} />
      <Gauge label="Speed" value={state.speed_kn.toFixed(1)} sub="knots" />
      <Gauge
        label="Rudder"
        value={`${Math.abs(r).toFixed(0)}° ${r < -0.5 ? "PORT" : r > 0.5 ? "STBD" : ""}`}
        sub={rudderSettling ? `→ ${state.rudder_cmd_deg.toFixed(0)}° · ~${rudderEta}s` : `ordered ${state.rudder_cmd_deg.toFixed(0)}°`}
        subClass={rudderSettling ? "settling" : ""}
      />
      <Gauge
        label="Telegraph"
        value={`${state.thrust_pct.toFixed(0)}%`}
        sub={engineSettling ? `→ ${telegraphLabel(state.thrust_cmd_pct)} (${state.thrust_cmd_pct.toFixed(0)}%)` : telegraphLabel(state.thrust_cmd_pct)}
        subClass={engineSettling ? "settling" : ""}
      />
      <Gauge
        label="Order Status"
        value={maneuvering ? "MANOEUVRING" : "ON ORDER"}
        valueClass={maneuvering ? "status settling-text" : "status"}
        sub={maneuvering ? "adjusting to order…" : "at commanded state"}
        subClass={maneuvering ? "settling" : ""}
      />
    </div>
  );
}

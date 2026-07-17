"use client";

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

const RUDDER_RATE = 5;  // deg/s (sim rate limit)
const THRUST_TAU = 8;   // s (sim first-order engine lag)

export default function Instruments({ state }) {
  if (!state) return null;
  const r = state.rudder_deg;

  // rudder is rate-limited → exact time to reach the ordered angle
  const rudderDiff = Math.abs(state.rudder_cmd_deg - r);
  const rudderSettling = rudderDiff > 0.5;
  const rudderEta = rudderDiff / RUDDER_RATE;

  // engine is first-order lag → time to close the gap to ~2%
  const thrustDiff = Math.abs(state.thrust_cmd_pct - state.thrust_pct);
  const engineSettling = thrustDiff > 1;
  const engineEta = thrustDiff > 2 ? THRUST_TAU * Math.log(thrustDiff / 2) : 0;

  const maneuvering = rudderSettling || engineSettling;
  const etaSec = Math.max(1, Math.ceil(Math.max(rudderSettling ? rudderEta : 0, engineSettling ? engineEta : 0)));

  return (
    <div className="instruments">
      <Gauge label="Speed" value={state.speed_kn.toFixed(1)} sub="knots" />
      <Gauge
        label="Rudder"
        value={`${Math.abs(r).toFixed(0)}° ${r < -0.5 ? "PORT" : r > 0.5 ? "STBD" : ""}`}
        sub={rudderSettling ? `→ ${state.rudder_cmd_deg.toFixed(0)}° · ~${Math.max(1, Math.ceil(rudderEta))}s` : `ordered ${state.rudder_cmd_deg.toFixed(0)}°`}
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
        value={maneuvering ? `~${etaSec}s` : "ON ORDER"}
        valueClass={maneuvering ? "settling-text" : "status"}
        sub={maneuvering ? "until order takes effect" : "at commanded state"}
        subClass={maneuvering ? "settling" : ""}
      />
    </div>
  );
}

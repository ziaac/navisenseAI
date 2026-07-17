"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Instruments from "../components/Instruments";
import Compass from "../components/Compass";
import { useNaviSocket } from "../lib/useNaviSocket";
import { WavRecorder } from "../lib/recorder";

const Scene = dynamic(() => import("../components/Scene"), { ssr: false });

export default function Bridge() {
  const { connected, state, messages, sendText, sendAudio, reset } = useNaviSocket();
  const stateRef = useRef(null);
  const [order, setOrder] = useState("");
  const [rec, setRec] = useState(false);
  const recorder = useRef(null);
  const consoleRef = useRef(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!order.trim()) return;
    sendText(order.trim());
    setOrder("");
  };

  const toggleMic = async () => {
    if (!rec) {
      recorder.current = new WavRecorder();
      await recorder.current.start();
      setRec(true);
    } else {
      setRec(false);
      const wavB64 = await recorder.current.stop();
      sendAudio(wavB64);
    }
  };

  return (
    <main style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Scene stateRef={stateRef} />

      <div className="hud">
        <div className="topbar">
          <div className="brand">NAVISENSE <span>AI</span> — SMCP BRIDGE SIMULATOR</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 12, border: "none", cursor: "pointer" }}>
              Reset
            </button>
            <div className={`conn ${connected ? "ok" : "bad"}`}>{connected ? "● BRAIN ONLINE" : "○ CONNECTING…"}</div>
          </div>
        </div>

        {state && (
          <div className="compass-fixed">
            <Compass heading={state.heading_deg} rot={state.yaw_rate_deg_s} />
          </div>
        )}

        <div>
          <Instruments state={state} />
          <div style={{ height: 10 }} />
          <form className="orderbar" onSubmit={submit}>
            <button type="button" className={`mic ${rec ? "rec" : ""}`} onClick={toggleMic} title="Hold your order, click to start/stop">
              {rec ? "■" : "🎙"}
            </button>
            <input
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder='Type an SMCP order… e.g. "Hard-a-port, ahead dead slow"'
            />
            <button type="submit">Execute</button>
          </form>
        </div>
      </div>

      <div className="console" ref={consoleRef}>
        {messages.map((m, i) => {
          if (m.type === "transcript")
            return (
              <div className="msg" key={i}>
                <div className="tag">Heard ({m.stt_ms} ms)</div>
                “{m.text}”
              </div>
            );
          if (m.type === "evaluation")
            return (
              <div className={`msg ${m.smcp_valid ? "valid" : "invalid"}`} key={i}>
                <div className="tag">
                  {m.smcp_valid ? "✓ Valid SMCP" : "✗ Not SMCP"} · {m.latency_ms} ms
                </div>
                {m.linguistic_feedback}
                {m.smcp_valid && (
                  <div className="tag" style={{ marginTop: 4 }}>
                    → rudder {m.physics_action.rudder_angle_deg}°, engine {m.physics_action.engine_thrust_pct}%
                  </div>
                )}
              </div>
            );
          return null;
        })}
      </div>
    </main>
  );
}

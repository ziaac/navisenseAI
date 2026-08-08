"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Instruments from "../components/Instruments";
import Compass from "../components/Compass";
import CommandBook from "../components/CommandBook";
import Advisor from "../components/Advisor";
import InfoPanel from "../components/InfoPanel";
import { useNaviSocket, resolveUrls } from "../lib/useNaviSocket";
import { WavRecorder } from "../lib/recorder";

const Scene = dynamic(() => import("../components/Scene"), { ssr: false });

const shortHost = (url) => {
  try { return new URL(url.replace(/^ws/, "http")).host; } catch { return url; }
};

export default function Bridge() {
  const [mode, setMode] = useState("mock"); // "mock" | "ai"
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiFellBack, setAiFellBack] = useState(false);
  const onAiFail = useCallback(() => { setMode("mock"); setAiFellBack(true); }, []);
  const { connected, state, messages, world, advisory, activeUrl, sendText, sendAudio, reset } =
    useNaviSocket(mode, onAiFail);

  const stateRef = useRef(null);
  const viewRef = useRef(270); // camera view bearing (deg), written by the 3D scene
  const [order, setOrder] = useState("");
  const [rec, setRec] = useState(false);
  const [sttBusy, setSttBusy] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const recorder = useRef(null);
  const consoleRef = useRef(null);

  useEffect(() => { setAiConfigured(!!resolveUrls().ai); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
    // voice pipeline finished: evaluation arrived, or STT heard nothing
    const last = messages[messages.length - 1];
    if (last && (last.type === "evaluation" || (last.type === "transcript" && !last.text))) {
      setSttBusy(false);
    }
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!order.trim()) return;
    sendText(order.trim());
    setOrder("");
  };

  // Voice needs Whisper, which only the GPU/AI brain runs. In MOCK mode the
  // audio would hit a brain with no STT and the mic would spin forever, so the
  // control is disabled and the user is told to switch engines.
  const voiceDisabled = mode !== "ai";

  const toggleMic = async () => {
    if (sttBusy || voiceDisabled) return;
    if (!rec) {
      recorder.current = new WavRecorder();
      await recorder.current.start();
      setRec(true);
    } else {
      setRec(false);
      setSttBusy(true);
      // safety: never leave the mic locked if the server stalls
      setTimeout(() => setSttBusy(false), 45000);
      const wavB64 = await recorder.current.stop();
      sendAudio(wavB64);
    }
  };

  return (
    <main style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Scene stateRef={stateRef} viewRef={viewRef} world={world} panMode={panMode} resetTick={resetTick} />

      <div className="hud">
        {/* ---------- header ---------- */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="brand">
              <img src="/logo.png" alt="NaviSense AI logo" className="brand-logo" />
              NAVISENSE <span>AI</span>
            </div>
            <div className="mode-switch" title={aiFellBack ? "AI endpoint unreachable — dropped back to Mock" : ""}>
              <button
                className={mode === "mock" ? "on" : ""}
                onClick={() => setMode("mock")}
              >MOCK MODE</button>
              <button
                className={mode === "ai" ? "on" : ""}
                disabled={!aiConfigured}
                title={aiConfigured ? "Local LLM + Whisper on AMD GPU" : "AI endpoint not configured — open with ?ai=wss://…"}
                onClick={() => { setAiFellBack(false); setMode("ai"); }}
              >AI MODE</button>
            </div>
          </div>

          <div className={`conn-detail ${connected ? "ok" : "bad"}`}>
            <div className="row">
              {connected ? "●" : "○"} {connected ? "ONLINE" : "OFFLINE"} · {mode === "ai" ? "AI ENGINE" : "MOCK ENGINE"}
            </div>
            <div className="sub">
              {connected ? shortHost(activeUrl) : "reconnecting…"}
              {state ? ` · sim ${state.t.toFixed(0)}s` : ""}
            </div>
          </div>
        </div>

        {state && (
          <div className="compass-fixed">
            <Compass heading={state.heading_deg} rot={state.yaw_rate_deg_s} viewRef={viewRef} />
          </div>
        )}

        {/* ---------- left rail ---------- */}
        <div className="left-rail">
          <button className="rail-btn" onClick={() => setInfoOpen(true)} title="About this application" aria-label="About">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9.2" /><path d="M12 11v5.2" /><circle cx="12" cy="7.8" r="0.4" fill="currentColor" />
            </svg>
          </button>
          <button className={`rail-btn ${bookOpen ? "on" : ""}`} onClick={() => setBookOpen(!bookOpen)} title="SMCP phrase book" aria-label="Phrase book">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M9 7h7M9 11h7" />
            </svg>
          </button>
          <button className={`rail-btn ${panMode ? "on" : ""}`} onClick={() => setPanMode(!panMode)}
            title={panMode ? "Hand tool ON — drag to pan; click to return to orbit & follow" : "Hand tool — drag to pan the view"} aria-label="Hand tool">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </button>
          <button
            className="rail-btn"
            onClick={() => { reset(); setPanMode(false); setResetTick((t) => t + 1); }}
            title="Reset simulation" aria-label="Reset"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
            </svg>
          </button>
          <a
            className="rail-btn" href="/admin" target="_blank" rel="noopener noreferrer"
            title="Instructor dashboard — live training log (sessions & attempts)" aria-label="Instructor dashboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12.5" y="7" width="3" height="10" /><rect x="18" y="13" width="3" height="4" />
            </svg>
          </a>
        </div>

        <Advisor advisory={advisory} onUse={(p) => setOrder(p)} />
        <InfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} />
        <CommandBook open={bookOpen} onClose={() => setBookOpen(false)} onPick={(p) => { setOrder(p); }} />

        {/* ---------- helm console (bottom centre) ---------- */}
        <div className="helm">
          <Instruments state={state} />
          <form className="orderbar" onSubmit={submit}>
            <button
              type="button"
              className={`mic ${rec ? "rec" : ""} ${sttBusy ? "busy" : ""} ${voiceDisabled ? "off" : ""}`}
              onClick={toggleMic}
              disabled={sttBusy || voiceDisabled}
              title={voiceDisabled ? "Voice input runs on the GPU — switch to AI MODE to use the microphone" : sttBusy ? "Processing your order…" : rec ? "Recording — click to stop & send" : "Speak your order — click to start"}
            >
              {sttBusy ? (
                <span className="mic-spinner" />
              ) : rec ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
                  <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
                  <path d="M12 17.5V21M8.5 21h7" />
                </svg>
              )}
            </button>
            <input
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder={sttBusy ? "Processing your voice order…" : rec ? "Listening… click the mic again to send" : 'Type an SMCP order… e.g. "Hard-a-port, ahead dead slow"'}
            />
            <button type="submit" disabled={sttBusy}>Execute</button>
          </form>
        </div>
      </div>

      {/* ---------- order log (bottom left, newest at bottom) ---------- */}
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
                  {m.engine === "llm" ? " · AI" : ""}
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

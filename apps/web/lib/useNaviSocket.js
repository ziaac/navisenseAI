"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Endpoint resolution:
//   mock  — ?brain= query override -> NEXT_PUBLIC_BRAIN_WS -> local dev default
//   ai    — ?ai= query override -> NEXT_PUBLIC_BRAIN_WS_AI -> null (mode disabled)
const norm = (u) => (u.endsWith("/session") ? u : u.replace(/\/$/, "") + "/session");

export function resolveUrls() {
  const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const mock = p?.get("brain") || process.env.NEXT_PUBLIC_BRAIN_WS || "ws://localhost:8000/session";
  const aiRaw = p?.get("ai") || process.env.NEXT_PUBLIC_BRAIN_WS_AI || "";
  return { mock: norm(mock), ai: aiRaw ? norm(aiRaw) : null };
}

// mode: "mock" | "ai". When the AI endpoint refuses to connect, onAiFail is
// called so the UI can drop back to mock automatically.
export function useNaviSocket(mode = "mock", onAiFail) {
  const wsRef = useRef(null);
  const sessionIdRef = useRef(null);
  const onAiFailRef = useRef(onAiFail);
  onAiFailRef.current = onAiFail;

  // Create (once) a training Session row via the web API so the brain can tag
  // persisted attempts against it. Cached across reconnects and mode switches.
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "channel_navigation" }),
      });
      if (res.ok) sessionIdRef.current = (await res.json()).id;
    } catch {
      /* dashboard telemetry is best-effort; never block the sim */
    }
    return sessionIdRef.current;
  }, []);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [world, setWorld] = useState(null);
  const [advisory, setAdvisory] = useState(null);
  const [activeUrl, setActiveUrl] = useState("");

  useEffect(() => {
    let alive = true;
    let everOpened = false;
    let attempts = 0;
    function connect() {
      const urls = resolveUrls();
      const url = mode === "ai" && urls.ai ? urls.ai : urls.mock;
      setActiveUrl(url);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!alive) return;
        everOpened = true;
        attempts = 0;
        setConnected(true);
        // Tag this connection with a persisted Session so attempts reach /admin.
        ensureSession().then((sid) => {
          if (sid && alive && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "init", session_id: sid }));
          }
        });
      };
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        attempts += 1;
        // AI endpoint never came up: fall back to mock instead of retrying forever
        if (mode === "ai" && !everOpened && attempts >= 2) {
          onAiFailRef.current?.();
          return;
        }
        setTimeout(connect, 2000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") setState(msg);
        else if (msg.type === "world") setWorld(msg);
        else if (msg.type === "advisory") setAdvisory(msg);
        else setMessages((m) => [...m.slice(-19), msg]);
      };
    }
    connect();
    return () => {
      alive = false;
      wsRef.current?.close();
    };
  }, [mode]);

  const sendText = useCallback((text) => {
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
  }, []);

  const sendAudio = useCallback((wavB64) => {
    wsRef.current?.send(JSON.stringify({ type: "audio", wav_b64: wavB64 }));
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "reset" }));
  }, []);

  return { connected, state, messages, world, advisory, activeUrl, sendText, sendAudio, reset };
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_BRAIN_WS || "ws://localhost:8000/session";

export function useNaviSocket() {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [world, setWorld] = useState(null);
  const [advisory, setAdvisory] = useState(null);

  useEffect(() => {
    let alive = true;
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => alive && setConnected(true);
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
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
  }, []);

  const sendText = useCallback((text) => {
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
  }, []);

  const sendAudio = useCallback((wavB64) => {
    wsRef.current?.send(JSON.stringify({ type: "audio", wav_b64: wavB64 }));
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "reset" }));
  }, []);

  return { connected, state, messages, world, advisory, sendText, sendAudio, reset };
}

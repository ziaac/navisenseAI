"""NaviSense AI — brain service.

FastAPI WebSocket endpoint tying together STT (Whisper), the SMCP agent
(local vLLM on ROCm) and the MuJoCo ship simulation.

WebSocket protocol (JSON messages):
  client -> server:
    {"type": "audio", "wav_b64": "<base64 wav>"}     voice order
    {"type": "text",  "text": "hard-a-port"}          typed order (dev/testing)
    {"type": "reset"}                                  reset simulation
  server -> client:
    {"type": "state", ...}          sim state stream (STATE_STREAM_HZ)
    {"type": "transcript", "text"}  STT result
    {"type": "evaluation", ...}     agent verdict incl. physics_action
"""
from __future__ import annotations

import asyncio
import base64
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import config
import world
from agent import SMCPAgent
from sim.loop import SimLoop

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("navisense")

sim = SimLoop(hz=config.SIM_HZ)
agent = None if config.MOCK_MODE else SMCPAgent()
stt = None  # lazy: loading Whisper takes time / VRAM


@asynccontextmanager
async def lifespan(app: FastAPI):
    sim.start()
    log.info("Simulation loop started at %s Hz", config.SIM_HZ)
    yield
    sim.stop()
    if agent:
        await agent.close()


app = FastAPI(title="NaviSense AI Brain", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


def _get_stt():
    global stt
    if stt is None:
        from stt import STT

        stt = STT()
    return stt


@app.get("/health")
async def health():
    return {"ok": True, "sim_t": sim.get_state()["t"]}


async def _handle_order(
    ws: WebSocket, transcript: str, session_id: str | None, stt_ms: int = 0
) -> None:
    state = sim.get_state()
    t0 = time.perf_counter()
    if config.MOCK_MODE:
        import mock_agent

        result = mock_agent.evaluate(
            transcript, state["rudder_cmd_deg"], state["thrust_cmd_pct"]
        )
    else:
        result = await agent.evaluate(
            transcript, state["rudder_cmd_deg"], state["thrust_cmd_pct"]
        )
    latency_ms = int((time.perf_counter() - t0) * 1000)
    pa = result["physics_action"]
    if result.get("smcp_valid"):
        sim.set_action(pa["rudder_angle_deg"], pa["engine_thrust_pct"])
    await ws.send_json({"type": "evaluation", "latency_ms": latency_ms, **result})
    if config.TELEMETRY_URL and session_id:
        asyncio.create_task(_log_attempt(session_id, transcript, result, latency_ms, stt_ms))


async def _log_attempt(
    session_id: str, transcript: str, result: dict, latency_ms: int, stt_ms: int
) -> None:
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0, trust_env=False) as c:
            await c.post(
                config.TELEMETRY_URL,
                json={
                    "session_id": session_id,
                    "transcript": transcript,
                    "smcp_valid": result.get("smcp_valid"),
                    "linguistic_feedback": result.get("linguistic_feedback"),
                    "physics_action": result.get("physics_action"),
                    "latency_ms": latency_ms,
                    "stt_ms": stt_ms,
                },
            )
    except Exception:
        log.warning("telemetry post failed", exc_info=False)


@app.websocket("/session")
async def session(ws: WebSocket):
    await ws.accept()
    # Per-connection training session id (client sends it in an "init" message so
    # attempts are persisted against the right Session row). Falls back to the
    # optional SESSION_ID env for standalone/legacy setups.
    session_id = config.SESSION_ID or None
    await ws.send_json({"type": "world", "buoys": world.BUOYS, "obstacles": world.OBSTACLES})

    async def stream_state():
        period = 1.0 / config.STATE_STREAM_HZ
        advisory_every = 2.0
        next_advisory = 0.0
        while True:
            st = sim.get_state()
            st["traffic"] = world.traffic_state(st["t"])
            await ws.send_json({"type": "state", **st})
            # second clause resyncs after a sim reset (t jumps back to 0)
            if st["t"] >= next_advisory or next_advisory - st["t"] > advisory_every:
                next_advisory = st["t"] + advisory_every
                await ws.send_json(world.advise(st))
            await asyncio.sleep(period)

    stream_task = asyncio.create_task(stream_state())
    try:
        while True:
            msg = await ws.receive_json()
            mtype = msg.get("type")
            if mtype == "init":
                session_id = msg.get("session_id") or session_id
            elif mtype == "audio":
                wav = base64.b64decode(msg["wav_b64"])
                t0 = time.perf_counter()
                transcript = await asyncio.to_thread(_get_stt().transcribe, wav)
                stt_ms = int((time.perf_counter() - t0) * 1000)
                await ws.send_json(
                    {"type": "transcript", "text": transcript, "stt_ms": stt_ms}
                )
                if transcript:
                    await _handle_order(ws, transcript, session_id, stt_ms)
            elif mtype == "text":
                await ws.send_json({"type": "transcript", "text": msg["text"], "stt_ms": 0})
                await _handle_order(ws, msg["text"], session_id, 0)
            elif mtype == "reset":
                sim.reset()
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

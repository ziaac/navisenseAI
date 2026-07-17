# NaviSense AI — Embodied SMCP Training Environment

**Track 3: Physical AI — AMD AI DevMaster Hackathon | Team EZi Edutech**

NaviSense AI trains maritime cadets in IMO Standard Marine Communication Phrases (SMCP). A cadet speaks a helm/engine order; the system transcribes it (Whisper), validates it linguistically against the SMCP syllabus (local LLM via vLLM on ROCm), and executes the resulting physics parameters on a 3D ship inside a MuJoCo rigid-body simulation — all running locally on a single AMD Radeon GPU.

## Architecture

```
Browser (Next.js + React Three Fiber)
   │ WebSocket
   ▼
FastAPI brain service  ──►  MuJoCo sim loop (50 Hz, 3-DOF ship hydrodynamics)
   ├─ Whisper STT  (PyTorch ROCm)
   └─ SMCP Agent ──► vLLM (ROCm, local, OpenAI-compatible, guided JSON)
        ▲
PostgreSQL + Prisma (curriculum, attempts, telemetry)
```

## Quick start (AMD Radeon GPU + ROCm)

```bash
# 1. PyTorch ROCm
pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.2

# 2. Service deps
pip install -r services/brain/requirements.txt

# 3. Local LLM (separate terminal)
vllm serve Qwen/Qwen2.5-7B-Instruct --host 0.0.0.0 --port 8001

# 4. Brain service
cd services/brain && uvicorn main:app --host 0.0.0.0 --port 8000
```

Smoke-test the simulation without AI:

```bash
cd services/brain && python -m sim.loop
```

Test an order over WebSocket (no microphone needed):

```json
{"type": "text", "text": "Hard-a-port, ahead dead slow"}
```

## Repository layout

```
services/brain/   FastAPI + Whisper + SMCP agent + MuJoCo sim
apps/web/         Next.js client (3D viewer, cadet UI, admin)
prisma/           Database schema (PostgreSQL)
docker/           ROCm Dockerfile
assets/           ship.glb (converted from FBX)
```

## License

MIT

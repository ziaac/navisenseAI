# NaviSense AI — Embodied SMCP Training Environment

**AMD AI DevMaster Hackathon — Track 3: Physical AI | Team EZi Edutech**

- 🌐 **Live demo:** https://navisense.eziedutech.dev
- 🎬 **Demo video (3 min):** https://youtu.be/j2IzzsKH6QE
- 📄 **Technical report:** [TECHNICAL-REPORT.md](./TECHNICAL-REPORT.md) / [TECHNICAL-REPORT.pdf](./TECHNICAL-REPORT.pdf)

NaviSense AI trains maritime cadets in IMO **Standard Marine Communication Phrases (SMCP)**. A cadet speaks a helm/engine order (*"Hard-a-port, ahead dead slow"*); the system transcribes it (Whisper on ROCm), validates it against the SMCP syllabus (local Qwen2.5-7B via llama.cpp HIP, schema-guided JSON), and executes the actuation on a MuJoCo ship simulation rendered live in the browser — all AI inference running locally on a single AMD Radeon GPU.

```
Browser (Next.js + React Three Fiber, WSS)
   ▼
FastAPI brain :8000 ──► MuJoCo 50 Hz (3-DOF ship hydrodynamics)
   ├─ Whisper large-v3-turbo (PyTorch ROCm)
   ├─ SMCP agent ──► llama.cpp HIP server :8001 (Qwen2.5-7B Q6_K, full GPU offload)
   └─ Rule-based SMCP parser (MOCK engine + automatic LLM fallback)
   ▼
PostgreSQL + Prisma (curriculum · sessions · attempts · telemetry) · /admin dashboard
```

The UI has two engines with automatic failover: **AI MODE** (GPU pipeline) and **MOCK MODE** (deterministic IMO A1/6.2 parser, CPU-only). Everything below is reproducible from this repository.

---

## 1. Requirements

| Component | Requirement |
|---|---|
| GPU brain (AI MODE) | AMD Radeon GPU + ROCm (verified: Radeon PRO W7900 48 GB, gfx1100, ROCm 7.2.1, Radeon Cloud) |
| Mock brain / physics | Any x86-64 Linux, Python 3.11+, no GPU |
| Web + DB | Node 20+, PostgreSQL 15+ (or Docker) |

## 2. GPU brain — full AI pipeline on AMD Radeon (ROCm)

Run on the GPU instance (paths assume a persistent `/workspace`; on Radeon Cloud use the JupyterLab terminal or SSH).

```bash
# 2.1 Code
cd /workspace && git clone https://github.com/ziaac/navisenseAI.git

# 2.2 Python env + PyTorch ROCm
python3 -m venv /workspace/navi-venv && source /workspace/navi-venv/bin/activate
pip install -U pip huggingface_hub
pip install --index-url https://download.pytorch.org/whl/rocm6.3 torch==2.7.1 torchaudio==2.7.1
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# expected: True  AMD Radeon PRO W7900

# 2.3 llama.cpp with HIP backend (~5-10 min compile)
export ROCM_PATH=/opt/rocm PATH=/opt/rocm/bin:$PATH
export HIPCXX="$(/opt/rocm/bin/hipconfig -l)/clang" HIP_PATH="$(/opt/rocm/bin/hipconfig -R)"
CMAKE_ARGS="-DGGML_HIP=ON -DAMDGPU_TARGETS=gfx1100" FORCE_CMAKE=1 \
  pip install --no-cache-dir "llama-cpp-python[server]"
# Note: vLLM PyPI wheels are CUDA-only; llama.cpp HIP provides the same
# OpenAI-compatible + JSON-schema-guided serving fully on ROCm.

# 2.4 Model (Qwen2.5-7B-Instruct GGUF Q6_K, ~6.3 GB)
# export HF_ENDPOINT=https://hf-mirror.com   # if huggingface.co is slow/blocked
python - <<'PY'
from huggingface_hub import hf_hub_download
p = hf_hub_download("bartowski/Qwen2.5-7B-Instruct-GGUF",
                    "Qwen2.5-7B-Instruct-Q6_K.gguf", local_dir="/workspace/models")
open("/workspace/QWEN_PATH","w").write(p); print(p)
PY

# 2.5 Serve LLM (all layers on GPU) + brain
nohup python -m llama_cpp.server --model "$(cat /workspace/QWEN_PATH)" \
  --n_gpu_layers -1 --n_ctx 4096 --host 0.0.0.0 --port 8001 > /workspace/llm.log 2>&1 &

cd /workspace/navisenseAI/services/brain
pip install -r requirements.txt
export LLM_BASE_URL=http://127.0.0.1:8001/v1 \
       LLM_MODEL="$(cat /workspace/QWEN_PATH)" \
       WHISPER_MODEL=large-v3-turbo WHISPER_DEVICE=cuda
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > /workspace/brain.log 2>&1 &

# 2.6 Verify
curl -s localhost:8000/health          # {"ok":true,...}
rocm-smi                               # VRAM ~24% with LLM+Whisper resident
```

Expose `:8000` to the internet (we use a Cloudflare named tunnel → `wss://navisense-gpu.eziedutech.dev`), then open the web app with AI MODE, or point any client at `ws(s)://<host>/session`.

**Measured on W7900 (production):** LLM 89–90 tok/s (11.1 ms/token); text order 1.0–1.5 s end-to-end; voice order 1.5–2.5 s (Whisper warm ≈0.06 s for 3 s audio); VRAM 24 %, 27 °C.

## 3. Mock brain — full product loop, CPU only (no GPU required)

```bash
cd services/brain
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" httpx websockets mujoco numpy
MOCK_MODE=1 uvicorn main:app --host 0.0.0.0 --port 8000
```

Physics smoke test without any server: `python -m sim.loop`

## 4. Web app + database

```bash
# Postgres (any instance) — then:
cd apps/web
npm install
npx prisma generate
DATABASE_URL=postgresql://user:pw@host:5432/navisense npx prisma db push
DATABASE_URL=... node ../../prisma/seed.mjs      # 3 modules / 23 SMCP phrases

NEXT_PUBLIC_BRAIN_WS=ws://localhost:8000/session \
NEXT_PUBLIC_BRAIN_WS_AI=wss://<your-gpu-host>/session \
DATABASE_URL=... npm run dev            # or: npm run build && npm start
```

Open http://localhost:3000 — type or speak an order. Instructor dashboard: `/admin`.
URL overrides without rebuild: `?brain=ws://…` (mock) and `?ai=wss://…` (AI).

## 5. Docker

```bash
# Web (Next.js + Prisma). NEXT_PUBLIC_* are baked at build time.
docker build -f docker/Dockerfile.web \
  --build-arg NEXT_PUBLIC_BRAIN_WS=wss://<brain-host>/session \
  --build-arg NEXT_PUBLIC_BRAIN_WS_AI=wss://<gpu-host>/session \
  -t ghcr.io/ziaac/navisense-web:1.0 .

# Brain, CPU mock engine
docker build -f docker/Dockerfile.brain-cpu -t ghcr.io/ziaac/navisense-brain-cpu:1.0 .
docker run -p 8000:8000 ghcr.io/ziaac/navisense-brain-cpu:1.0

# Brain, ROCm GPU (run on an AMD GPU host)
docker build -f docker/Dockerfile.rocm -t ghcr.io/ziaac/navisense-brain-rocm:1.0 .
docker run --device=/dev/kfd --device=/dev/dri --group-add video \
  -p 8000:8000 ghcr.io/ziaac/navisense-brain-rocm:1.0
```

Pre-built images are published on GHCR (no build needed):

```bash
docker pull ghcr.io/ziaac/navisense-web:1.0
docker pull ghcr.io/ziaac/navisense-brain-cpu:1.0
```

- Web: https://github.com/ziaac/navisenseAI/pkgs/container/navisense-web
- Brain (CPU mock): https://github.com/ziaac/navisenseAI/pkgs/container/navisense-brain-cpu

The ROCm GPU brain image is built from `docker/Dockerfile.rocm` on an AMD GPU host (see §4).

### Run the published images locally (laptop / notebook, no GPU)

The GPU is the primary execution path (§2/§4). For evaluators **without** AMD
hardware, the CPU mock brain reproduces the full application pipeline (text
orders + 3D simulation + instruments) on any laptop:

```bash
docker pull ghcr.io/ziaac/navisense-brain-cpu:1.0
docker pull ghcr.io/ziaac/navisense-web:1.0

docker run -d --name navisense-brain -p 8000:8000 ghcr.io/ziaac/navisense-brain-cpu:1.0
docker run -d --name navisense-web   -p 3000:3000 ghcr.io/ziaac/navisense-web:1.0
```

Then open **`http://localhost:3000/?brain=ws://localhost:8000/session`** — the
`?brain=` query points the UI at your local brain (the image's default brain URL
is baked at build time). Type an order such as `Hard-a-port, ahead dead slow`
and the ship maneuvers. (Voice / real LLM run in AI mode against a ROCm GPU
brain; the mock covers typed SMCP orders.)

**Optional — the `/admin` instructor dashboard** needs PostgreSQL:

```bash
docker network create navisense
docker run -d --name navisense-db --network navisense \
  -e POSTGRES_USER=navisense -e POSTGRES_PASSWORD=navisense -e POSTGRES_DB=navisense postgres:15
docker rm -f navisense-brain navisense-web
docker run -d --name navisense-brain --network navisense -p 8000:8000 \
  -e TELEMETRY_URL=http://navisense-web:3000/api/attempts ghcr.io/ziaac/navisense-brain-cpu:1.0
docker run -d --name navisense-web --network navisense -p 3000:3000 \
  -e DATABASE_URL=postgresql://navisense:navisense@navisense-db:5432/navisense ghcr.io/ziaac/navisense-web:1.0
docker exec navisense-web npx prisma db push
docker exec navisense-web node prisma-schema/seed.mjs
```

Bridge: `http://localhost:3000/?brain=ws://localhost:8000/session` · Dashboard: `http://localhost:3000/admin`

## 6. Step-by-step reproduction of submitted results

1. **Physics behavior:** run `python -m sim.loop` — verify acceleration to ~18.5 kn at Full Ahead and a stable ~1.2°/s hard-a-port turn with speed loss to ~8.6 kn.
2. **Mock pipeline:** §3, then send `{"type":"text","text":"Hard-a-port, ahead dead slow"}` to `ws://localhost:8000/session` — expect `smcp_valid:true`, rudder −35°, thrust 20 %, and streaming state.
3. **GPU pipeline:** §2 on a ROCm machine — repeat the same order; expect `engine` ≠ `mock`, latency 1.0–1.5 s; confirm throughput in `/workspace/llm.log` (~90 tok/s) and VRAM via `rocm-smi`.
4. **Voice:** open the web UI, hold the mic button, speak *"Half ahead"* — expect transcript, validation, telegraph response on instruments.
5. **Invalid order:** send *"turn the boat left please"* — expect `smcp_valid:false` with the corrective SMCP phrase; ship state unchanged.
6. **Curriculum & telemetry:** §4, then `/admin` — 3 modules / 23 phrases; attempts appear after orders when telemetry env is set.

## 7. Repository layout

```
services/brain/     FastAPI WS · Whisper (ROCm) · SMCP agent (guided JSON) ·
                    rule-based parser · MuJoCo sim (ship.xml, hydro.py, loop.py)
apps/web/           Next.js 14 + R3F bridge UI · instruments · admin · API routes
prisma/             PostgreSQL schema + SMCP curriculum seed
docker/             Dockerfile.web · Dockerfile.brain-cpu · Dockerfile.rocm
TECHNICAL-REPORT.md Submission technical report
```

## License

MIT. Uses open models Qwen2.5-7B-Instruct (Apache-2.0) and Whisper (MIT); ship 3D asset converted from a licensed FBX source.

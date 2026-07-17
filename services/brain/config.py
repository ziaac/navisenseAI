"""Central configuration via environment variables."""
import os

# Mock mode: 1 = rule-based SMCP parser, no GPU/LLM/Whisper required.
MOCK_MODE = os.getenv("MOCK_MODE", "0") == "1"

# LLM (OpenAI-compatible). Local vLLM on the Radeon instance by default.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://127.0.0.1:8001/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "EMPTY")
LLM_MODEL = os.getenv("LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")

# Whisper
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")  # ROCm PyTorch uses the cuda alias
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "float16")

# Optional: web app endpoint to persist attempts (empty = disabled)
TELEMETRY_URL = os.getenv("TELEMETRY_URL", "")  # e.g. https://app.example.com/api/attempts
SESSION_ID = os.getenv("SESSION_ID", "")

# Sim
SIM_HZ = float(os.getenv("SIM_HZ", "50"))
STATE_STREAM_HZ = float(os.getenv("STATE_STREAM_HZ", "20"))

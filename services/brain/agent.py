"""SMCP cognitive agent: validates a cadet's spoken order against Standard
Marine Communication Phrases and produces physics actuation parameters.

Uses an OpenAI-compatible endpoint (local vLLM on ROCm). JSON output is
enforced via guided decoding (vLLM `guided_json`) with a plain json_object
fallback for other servers.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

import config

log = logging.getLogger(__name__)

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "smcp_valid": {"type": "boolean"},
        "matched_phrase": {"type": "string"},
        "linguistic_feedback": {"type": "string"},
        "physics_action": {
            "type": "object",
            "properties": {
                "rudder_angle_deg": {"type": "number", "minimum": -35, "maximum": 35},
                "engine_thrust_pct": {"type": "number", "minimum": -100, "maximum": 100},
            },
            "required": ["rudder_angle_deg", "engine_thrust_pct"],
        },
    },
    "required": ["smcp_valid", "linguistic_feedback", "physics_action"],
}

SYSTEM_PROMPT = """You are the cognitive module of NaviSense AI, a maritime cadet trainer for IMO Standard Marine Communication Phrases (SMCP).

Given a transcribed voice order from a cadet at the helm, you must:
1. Decide if it is a valid SMCP helm/engine order (smcp_valid). Be STRICT:
   smcp_valid=true ONLY when the utterance uses the standard SMCP wording
   (minor punctuation/case differences are fine). Paraphrases, casual wording
   or added chatter ("make it half ahead please", "turn the wheel a bit left")
   are NOT valid SMCP even when the intent is clear.
2. Give short linguistic feedback (max 2 sentences), NEVER empty.
   - valid: confirm the order back, e.g. "Correct SMCP order: Hard-a-port."
   - invalid: teach the exact SMCP phrase for the intent, e.g. "Not standard
     SMCP. Say: 'Port five'." If the intent is unclear, list example forms.
3. Output the physics action: the ordered values ONLY when smcp_valid is true;
   otherwise repeat the current values passed in context (ship keeps state).

Conventions:
- Rudder: port = negative degrees, starboard = positive. "Hard-a-port" = -35, "hard-a-starboard" = +35, "midships" = 0, "port five" = -5, "starboard ten" = +10, etc.
- Engine telegraph (percent thrust): "full ahead"=100, "half ahead"=50, "slow ahead"=30, "dead slow ahead"=20, "stop engine"=0, "dead slow astern"=-20, "slow astern"=-30, "half astern"=-50, "full astern"=-100.
- A single utterance may contain both a helm and an engine order.
- If only one of helm/engine is ordered, keep the other at its current value (provided in context).

Respond ONLY with JSON matching the required schema."""


class SMCPAgent:
    def __init__(self):
        # trailing slash matters: httpx drops the base path ("/v1") when the
        # request path starts with "/", so join relative instead
        self.client = httpx.AsyncClient(
            base_url=config.LLM_BASE_URL.rstrip("/") + "/",
            headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
            timeout=30.0,
            trust_env=False,  # local endpoint; ignore system proxy settings
        )

    async def close(self) -> None:
        await self.client.aclose()

    async def evaluate(self, transcript: str, current_rudder: float, current_thrust: float) -> dict:
        user_msg = (
            f"Current state: rudder_angle_deg={current_rudder}, engine_thrust_pct={current_thrust}\n"
            f'Cadet order (transcribed): "{transcript}"'
        )
        payload: dict[str, Any] = {
            "model": config.LLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.0,
            "max_tokens": 300,
        }
        # Structured-output dialects differ per server; try from strictest to
        # loosest until one is accepted (vLLM/OpenAI -> llama.cpp -> plain).
        response_formats = [
            {"type": "json_schema", "json_schema": {"name": "smcp_eval", "schema": RESPONSE_SCHEMA}},
            {"type": "json_object", "schema": RESPONSE_SCHEMA},
            {"type": "json_object"},
        ]
        try:
            r = None
            for fmt in response_formats:
                payload["response_format"] = fmt
                r = await self.client.post("chat/completions", json=payload)
                if r.status_code < 400:
                    break
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            result = json.loads(_strip_fences(content))
        except Exception:
            log.exception("LLM evaluation failed; using rule-based fallback")
            import mock_agent

            result = mock_agent.evaluate(transcript, current_rudder, current_thrust)
            result["engine"] = "fallback"
            return result
        # clamp defensively
        pa = result.get("physics_action", {})
        pa["rudder_angle_deg"] = max(-35.0, min(35.0, float(pa.get("rudder_angle_deg", current_rudder))))
        pa["engine_thrust_pct"] = max(-100.0, min(100.0, float(pa.get("engine_thrust_pct", current_thrust))))
        result["physics_action"] = pa
        return result


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    return t.strip()

"""Rule-based SMCP parser.

Two roles:
1. MOCK_MODE=1 -> full replacement for the LLM so the entire pipeline
   (order -> validation -> physics -> UI) runs without any GPU.
2. Safety fallback if the local LLM endpoint is unreachable at demo time.

Covers IMO SMCP A1/6.2 standard wheel/engine orders.
"""
from __future__ import annotations

import re

_NUM = {
    "five": 5, "ten": 10, "fifteen": 15, "twenty": 20, "twenty-five": 25,
    "5": 5, "10": 10, "15": 15, "20": 20, "25": 25,
}

HELM_PATTERNS: list[tuple[str, float | str]] = [
    (r"\bmidships?\b|\bmid ships\b|\bwheel amidships\b", 0.0),
    (r"\bhard[\s-]*a?[\s-]*port\b", -35.0),
    (r"\bhard[\s-]*a?[\s-]*starboard\b|\bhard[\s-]*a?[\s-]*stbd\b", 35.0),
    (r"\bport\s+(five|ten|fifteen|twenty(?:-five)?|5|10|15|20|25)\b", "port_n"),
    (r"\bstarboard\s+(five|ten|fifteen|twenty(?:-five)?|5|10|15|20|25)\b", "stbd_n"),
    (r"\bsteady\b|\bsteady as she goes\b", "steady"),
]

ENGINE_PATTERNS: list[tuple[str, float]] = [
    (r"\bfull\s+(speed\s+)?ahead\b|\bahead\s+full\b", 100.0),
    (r"\bhalf\s+ahead\b|\bahead\s+half\b", 50.0),
    (r"\bdead\s+slow\s+ahead\b|\bahead\s+dead\s+slow\b", 20.0),
    (r"\bslow\s+ahead\b|\bahead\s+slow\b", 30.0),
    (r"\bfull\s+(speed\s+)?astern\b|\bastern\s+full\b", -100.0),
    (r"\bhalf\s+astern\b|\bastern\s+half\b", -50.0),
    (r"\bdead\s+slow\s+astern\b|\bastern\s+dead\s+slow\b", -20.0),
    (r"\bslow\s+astern\b|\bastern\s+slow\b", -30.0),
    (r"\bstop\s+(the\s+)?engines?\b|\bengines?\s+stop\b|\bstop\b", 0.0),
]

CANONICAL = {
    -35.0: "Hard-a-port", 35.0: "Hard-a-starboard", 0.0: "Midships",
}


def evaluate(transcript: str, current_rudder: float, current_thrust: float) -> dict:
    text = transcript.lower().strip().rstrip(".!,")
    rudder: float | None = None
    thrust: float | None = None
    matched: list[str] = []

    for pat, val in HELM_PATTERNS:
        m = re.search(pat, text)
        if not m:
            continue
        if val == "steady":
            rudder = 0.0
            matched.append("Steady")
        elif val == "port_n":
            rudder = -float(_NUM[m.group(1)])
            matched.append(f"Port {abs(int(rudder))}")
        elif val == "stbd_n":
            rudder = float(_NUM[m.group(1)])
            matched.append(f"Starboard {int(rudder)}")
        else:
            rudder = float(val)
            matched.append(CANONICAL.get(rudder, f"rudder {rudder}"))
        break

    # engine: check longer/more specific patterns first (list is ordered)
    for pat, val in ENGINE_PATTERNS:
        if re.search(pat, text):
            # avoid "stop" matching inside valid helm-only orders like "steady"
            thrust = float(val)
            matched.append(_engine_name(val))
            break

    valid = rudder is not None or thrust is not None
    if valid:
        feedback = f"Correct SMCP order: {', '.join(matched)}."
    else:
        feedback = (
            'Not a standard SMCP wheel/engine order. Use forms like '
            '"Hard-a-port", "Port ten", "Midships", "Half ahead", "Stop engines".'
        )
    return {
        "smcp_valid": valid,
        "matched_phrase": ", ".join(matched),
        "linguistic_feedback": feedback,
        "physics_action": {
            "rudder_angle_deg": rudder if rudder is not None else current_rudder,
            "engine_thrust_pct": thrust if thrust is not None else current_thrust,
        },
        "engine": "mock",
    }


def _engine_name(pct: float) -> str:
    names = {
        100.0: "Full ahead", 50.0: "Half ahead", 30.0: "Slow ahead", 20.0: "Dead slow ahead",
        0.0: "Stop engines", -20.0: "Dead slow astern", -30.0: "Slow astern",
        -50.0: "Half astern", -100.0: "Full astern",
    }
    return names.get(pct, f"engine {pct}%")

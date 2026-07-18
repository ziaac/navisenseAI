"""Static world model + rule-based navigation advisor.

All positions are in sim metres (the client renders at metres / 10).
The ship starts at (0, 0) heading 090 (east); the channel centerline runs
along +x with lateral buoy pairs marking its edges.

This module is the "perception tier A" data source: the advisor reads
ground-truth object states. Tier B (YOLO on rendered frames) plugs into the
same calculators by replacing `visible_objects`.
"""
from __future__ import annotations

import math

# ---------------- world layout ----------------

BUOYS = [
    {"id": "b1r", "x": 300, "y": 60,  "color": "red"},
    {"id": "b1g", "x": 300, "y": -60, "color": "green"},
    {"id": "b2r", "x": 600, "y": 50,  "color": "red"},
    {"id": "b2g", "x": 600, "y": -50, "color": "green"},
    {"id": "b3r", "x": 900, "y": 55,  "color": "red"},
    {"id": "b3g", "x": 900, "y": -55, "color": "green"},
]

OBSTACLES = [
    # volcanic island north of the channel — shallow water hazard
    {"id": "island", "type": "island", "x": 1600, "y": 700, "radius": 450,
     "heading_deg": 0, "scale": 0.5, "label": "Island / shallow water"},
    # anchored container ship south of the channel entrance
    {"id": "cargo", "type": "cargoship", "x": 700, "y": -180, "radius": 90,
     "heading_deg": 60, "scale": 1.0, "label": "Anchored container ship"},
]

# crossing fishing vessel: shuttles across the channel ahead of the ship
_TRAFFIC = {
    "id": "boat1", "type": "smallship", "label": "Small craft",
    "x": 500, "y0": -350, "y1": 350, "speed_ms": 2.5,
}


def traffic_state(t: float) -> list[dict]:
    """Deterministic position of moving traffic at sim time t (ping-pong path)."""
    tr = _TRAFFIC
    leg = (tr["y1"] - tr["y0"]) / tr["speed_ms"]          # seconds per crossing
    s = t % (2 * leg)
    if s < leg:
        y = tr["y0"] + tr["speed_ms"] * s
        heading = 0.0    # northbound
        vy = tr["speed_ms"]
    else:
        y = tr["y1"] - tr["speed_ms"] * (s - leg)
        heading = 180.0  # southbound
        vy = -tr["speed_ms"]
    return [{
        "id": tr["id"], "type": tr["type"], "label": tr["label"],
        "x": tr["x"], "y": round(y, 1), "heading_deg": heading,
        "vx": 0.0, "vy": vy,
    }]


# ---------------- advisor ----------------

def _bearing_deg(dx_east: float, dy_north: float) -> float:
    return math.degrees(math.atan2(dx_east, dy_north)) % 360.0


def _rel_deg(bearing: float, heading: float) -> float:
    """Relative bearing -180..180 (negative = to port)."""
    return ((bearing - heading + 540.0) % 360.0) - 180.0


def _turn_order(diff_deg: float) -> str | None:
    """Map a signed course change (positive = starboard) to an SMCP order."""
    a = abs(diff_deg)
    side = "Starboard" if diff_deg > 0 else "Port"
    if a < 4:
        return None
    if a < 12:
        return f"{side} five"
    if a < 22:
        return f"{side} ten"
    return f"{side} twenty"


def advise(state: dict) -> dict:
    """Detected objects + a single recommended SMCP order (or None)."""
    sx, sy = state["pos"][0], state["pos"][1]
    heading = state["heading_deg"]
    speed = state["speed_kn"] * 0.5144  # m/s

    objects = []
    recommendation = None

    # --- moving traffic: closest point of approach ---
    for tr in traffic_state(state["t"]):
        dx, dy = tr["x"] - sx, tr["y"] - sy
        rng = math.hypot(dx, dy)
        brg = _bearing_deg(dx, dy)
        rel = _rel_deg(brg, heading)
        h = math.radians(90.0 - heading)  # nav heading -> math angle
        rvx = tr["vx"] - speed * math.cos(h)
        rvy = tr["vy"] - speed * math.sin(h)
        rv2 = rvx * rvx + rvy * rvy
        t_cpa = -(dx * rvx + dy * rvy) / rv2 if rv2 > 1e-6 else 0.0
        d_cpa = math.hypot(dx + rvx * max(t_cpa, 0.0), dy + rvy * max(t_cpa, 0.0))
        risk = "high" if (0 < t_cpa < 180 and d_cpa < 150 and rng < 900) else \
               "watch" if rng < 1200 else "clear"
        objects.append({"id": tr["id"], "type": tr["type"], "label": tr["label"],
                        "range_m": round(rng), "rel_deg": round(rel), "risk": risk})
        if risk == "high" and recommendation is None:
            if rng < 350:
                order = "Stop engines"
            else:
                order = "Slow ahead" if state["thrust_cmd_pct"] > 35 else "Dead slow ahead"
            recommendation = {
                "order": order,
                "reason": f"Crossing craft {round(rng)} m, CPA {round(d_cpa)} m in {round(t_cpa)} s — reduce speed to pass astern.",
            }

    # --- fixed hazards ---
    for ob in OBSTACLES:
        dx, dy = ob["x"] - sx, ob["y"] - sy
        rng = math.hypot(dx, dy) - ob["radius"]
        brg = _bearing_deg(dx, dy)
        rel = _rel_deg(brg, heading)
        risk = "high" if (rng < 400 and abs(rel) < 45) else \
               "watch" if rng < 900 else "clear"
        objects.append({"id": ob["id"], "type": ob["type"], "label": ob["label"],
                        "range_m": round(max(rng, 0)), "rel_deg": round(rel), "risk": risk})
        if risk == "high" and recommendation is None:
            order = _turn_order(-40.0 if rel >= 0 else 40.0)  # turn away from hazard side
            if order:
                recommendation = {
                    "order": order,
                    "reason": f"{ob['label']} {round(max(rng, 0))} m on the {'starboard' if rel >= 0 else 'port'} bow — alter course away.",
                }

    # --- channel keeping (aim at a point 400 m ahead on the centerline) ---
    if recommendation is None and abs(sy) > 30 and speed > 0.5:
        brg_target = _bearing_deg(400.0, -sy)
        diff = _rel_deg(brg_target, heading)
        order = _turn_order(diff)
        if order:
            recommendation = {
                "order": order,
                "reason": f"{abs(round(sy))} m {'north' if sy > 0 else 'south'} of the channel centerline — steer back on track.",
            }

    return {"type": "advisory", "objects": objects, "recommendation": recommendation}

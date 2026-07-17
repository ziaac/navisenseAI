"""Headless MuJoCo simulation loop (default 50 Hz) with planar constraint."""
from __future__ import annotations

import math
import threading
import time
from pathlib import Path

import mujoco
import numpy as np

from .hydro import ShipDynamics

MODEL_PATH = Path(__file__).parent / "ship.xml"


def _quat_to_yaw(q: np.ndarray) -> float:
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


class SimLoop:
    def __init__(self, hz: float = 50.0):
        self.model = mujoco.MjModel.from_xml_path(str(MODEL_PATH))
        self.data = mujoco.MjData(self.model)
        self.dyn = ShipDynamics()
        self.hz = hz
        self.dt = self.model.opt.timestep
        self._ship_bid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_BODY, "ship")
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self.t = 0.0

    # ---------------- public API ----------------
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def set_action(self, rudder_angle_deg: float, engine_thrust_pct: float) -> None:
        with self._lock:
            self.dyn.set_action(rudder_angle_deg, engine_thrust_pct)

    def reset(self) -> None:
        with self._lock:
            mujoco.mj_resetData(self.model, self.data)
            self.dyn.__init__(self.dyn.p)
            self.t = 0.0

    def get_state(self) -> dict:
        with self._lock:
            qpos = self.data.qpos[:7].copy()
            qvel = self.data.qvel[:6].copy()
            yaw = _quat_to_yaw(qpos[3:7])
            # body-frame velocities
            c, s = math.cos(yaw), math.sin(yaw)
            u = c * qvel[0] + s * qvel[1]
            v = -s * qvel[0] + c * qvel[1]
            heading = (90.0 - math.degrees(yaw)) % 360.0  # nav convention: 0=N, CW
            return {
                "t": round(self.t, 2),
                "pos": [round(qpos[0], 2), round(qpos[1], 2), 0.0],
                "heading_deg": round(heading, 1),
                "yaw_rad": round(yaw, 4),
                "speed_kn": round(math.hypot(u, v) * 1.9438, 2),
                "surge_ms": round(u, 2),
                "sway_ms": round(v, 2),
                "yaw_rate_deg_s": round(math.degrees(qvel[5]), 3),
                "rudder_deg": round(self.dyn.rudder_deg, 1),
                "rudder_cmd_deg": round(self.dyn.rudder_cmd_deg, 1),
                "thrust_pct": round(self.dyn.thrust_pct, 1),
                "thrust_cmd_pct": round(self.dyn.thrust_cmd_pct, 1),
            }

    # ---------------- internals ----------------
    def _apply_forces(self) -> None:
        yaw = _quat_to_yaw(self.data.qpos[3:7])
        c, s = math.cos(yaw), math.sin(yaw)
        vx, vy = self.data.qvel[0], self.data.qvel[1]
        u = c * vx + s * vy          # surge
        v = -s * vx + c * vy         # sway
        r = self.data.qvel[5]        # yaw rate
        fx_b, fy_b, mz = self.dyn.body_forces(u, v, r)
        # body -> world
        fx_w = c * fx_b - s * fy_b
        fy_w = s * fx_b + c * fy_b
        self.data.xfrc_applied[self._ship_bid, :] = [fx_w, fy_w, 0, 0, 0, mz]

    def _enforce_planar(self) -> None:
        """Suppress heave/roll/pitch: project pose back to the plane."""
        self.data.qpos[2] = 0.0                       # z
        yaw = _quat_to_yaw(self.data.qpos[3:7])
        self.data.qpos[3:7] = [math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)]
        self.data.qvel[2] = 0.0
        self.data.qvel[3] = 0.0
        self.data.qvel[4] = 0.0

    def _run(self) -> None:
        period = 1.0 / self.hz
        while self._running:
            t0 = time.perf_counter()
            with self._lock:
                self.dyn.step_actuators(self.dt)
                self._apply_forces()
                mujoco.mj_step(self.model, self.data)
                self._enforce_planar()
                self.t += self.dt
            elapsed = time.perf_counter() - t0
            time.sleep(max(0.0, period - elapsed))


if __name__ == "__main__":
    # quick CLI smoke test: hard-a-port, ahead dead slow, run 60 sim-seconds
    sim = SimLoop()
    sim.set_action(rudder_angle_deg=-35.0, engine_thrust_pct=20.0)
    for i in range(60 * 50):
        sim.dyn.step_actuators(sim.dt)
        sim._apply_forces()
        mujoco.mj_step(sim.model, sim.data)
        sim._enforce_planar()
        sim.t += sim.dt
        if i % 250 == 0:
            print(sim.get_state())

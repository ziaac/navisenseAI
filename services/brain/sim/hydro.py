"""Simplified 3-DOF (surge, sway, yaw) ship hydrodynamics for MuJoCo.

Forces are computed in the body frame and applied to the free-floating hull
via data.xfrc_applied each step. Heave/roll/pitch are suppressed (planar
constraint) which is a standard simplification for maneuvering simulation
(Nomoto/Fossen style).
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass


@dataclass
class ShipParams:
    mass: float = 8.0e6            # kg
    max_thrust: float = 1.2e6      # N  (100% telegraph)
    max_rudder_deg: float = 35.0
    rudder_rate_deg_s: float = 5.0     # realistic steering gear rate
    thrust_tau_s: float = 8.0          # first-order engine lag
    # damping coefficients (linear + quadratic), tuned for stable behavior
    xu: float = 6.0e4;  xuu: float = 4.0e3     # surge
    yv: float = 4.0e5;  yvv: float = 3.0e4     # sway
    nr: float = 6.0e9;  nrr: float = 2.0e9     # yaw
    # rudder effectiveness
    rudder_force_gain: float = 2.0e5   # N per (rad * (m/s)^2)
    rudder_arm_m: float = 55.0         # lever arm from CG to rudder
    rudder_sway_frac: float = 0.15     # fraction of rudder force felt as net sway
    turn_drag: float = 8.0e6           # speed loss while turning: N per (rad/s * m/s)


class ShipDynamics:
    """Holds actuator state and computes body-frame forces each step."""

    def __init__(self, p: ShipParams | None = None):
        self.p = p or ShipParams()
        self.rudder_cmd_deg = 0.0    # ordered
        self.rudder_deg = 0.0        # actual (rate-limited)
        self.thrust_cmd_pct = 0.0    # ordered  (-100..100, negative = astern)
        self.thrust_pct = 0.0        # actual (first-order lag)

    def set_action(self, rudder_angle_deg: float, engine_thrust_pct: float) -> None:
        self.rudder_cmd_deg = float(np.clip(rudder_angle_deg, -self.p.max_rudder_deg, self.p.max_rudder_deg))
        self.thrust_cmd_pct = float(np.clip(engine_thrust_pct, -100.0, 100.0))

    def step_actuators(self, dt: float) -> None:
        # rudder: rate limit
        err = self.rudder_cmd_deg - self.rudder_deg
        max_step = self.p.rudder_rate_deg_s * dt
        self.rudder_deg += float(np.clip(err, -max_step, max_step))
        # engine: first-order lag
        alpha = dt / max(self.p.thrust_tau_s, dt)
        self.thrust_pct += alpha * (self.thrust_cmd_pct - self.thrust_pct)

    def body_forces(self, u: float, v: float, r: float) -> tuple[float, float, float]:
        """u=surge m/s, v=sway m/s, r=yaw rad/s -> (Fx, Fy, Mz) body frame."""
        p = self.p
        thrust = p.max_thrust * (self.thrust_pct / 100.0)
        # damping
        fx = thrust - (p.xu * u + p.xuu * u * abs(u))
        fy = -(p.yv * v + p.yvv * v * abs(v))
        mz = -(p.nr * r + p.nrr * r * abs(r))
        # rudder lift: proportional to flow speed^2 at rudder and rudder angle
        flow2 = max(u, 0.0) ** 2 + 0.1  # keep a little effectiveness at low speed
        delta = np.deg2rad(self.rudder_deg)
        # Port rudder (delta<0): stern pushed to starboard, bow swings to port
        # (positive yaw / CCW in body frame with z-up) -> heading decreases.
        f_rudder = p.rudder_force_gain * flow2 * delta
        fy += -p.rudder_sway_frac * f_rudder  # small opposing sway
        mz += -f_rudder * p.rudder_arm_m      # stbd rudder (delta>0) -> CW turn -> heading increases
        # speed loss in a turn (added resistance)
        fx -= p.turn_drag * abs(r) * u
        return float(fx), float(fy), float(mz)

// SMCP curriculum seed (IMO SMCP A1/6.2 wheel & engine orders)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const modules = [
  {
    title: "Module 1 — Wheel Orders",
    order: 1,
    phrases: [
      ["Midships", "helm", { rudder_angle_deg: 0, engine_thrust_pct: null }],
      ["Port five", "helm", { rudder_angle_deg: -5, engine_thrust_pct: null }],
      ["Port ten", "helm", { rudder_angle_deg: -10, engine_thrust_pct: null }],
      ["Port twenty", "helm", { rudder_angle_deg: -20, engine_thrust_pct: null }],
      ["Hard-a-port", "helm", { rudder_angle_deg: -35, engine_thrust_pct: null }],
      ["Starboard five", "helm", { rudder_angle_deg: 5, engine_thrust_pct: null }],
      ["Starboard ten", "helm", { rudder_angle_deg: 10, engine_thrust_pct: null }],
      ["Starboard twenty", "helm", { rudder_angle_deg: 20, engine_thrust_pct: null }],
      ["Hard-a-starboard", "helm", { rudder_angle_deg: 35, engine_thrust_pct: null }],
      ["Steady as she goes", "helm", { rudder_angle_deg: 0, engine_thrust_pct: null }],
    ],
  },
  {
    title: "Module 2 — Engine Orders",
    order: 2,
    phrases: [
      ["Full ahead", "engine", { rudder_angle_deg: null, engine_thrust_pct: 100 }],
      ["Half ahead", "engine", { rudder_angle_deg: null, engine_thrust_pct: 50 }],
      ["Slow ahead", "engine", { rudder_angle_deg: null, engine_thrust_pct: 30 }],
      ["Dead slow ahead", "engine", { rudder_angle_deg: null, engine_thrust_pct: 20 }],
      ["Stop engines", "engine", { rudder_angle_deg: null, engine_thrust_pct: 0 }],
      ["Dead slow astern", "engine", { rudder_angle_deg: null, engine_thrust_pct: -20 }],
      ["Slow astern", "engine", { rudder_angle_deg: null, engine_thrust_pct: -30 }],
      ["Half astern", "engine", { rudder_angle_deg: null, engine_thrust_pct: -50 }],
      ["Full astern", "engine", { rudder_angle_deg: null, engine_thrust_pct: -100 }],
    ],
  },
  {
    title: "Module 3 — Combined Maneuvers",
    order: 3,
    phrases: [
      ["Hard-a-port, ahead dead slow", "combined", { rudder_angle_deg: -35, engine_thrust_pct: 20 }],
      ["Starboard ten, half ahead", "combined", { rudder_angle_deg: 10, engine_thrust_pct: 50 }],
      ["Midships, stop engines", "combined", { rudder_angle_deg: 0, engine_thrust_pct: 0 }],
      ["Hard-a-starboard, full ahead", "combined", { rudder_angle_deg: 35, engine_thrust_pct: 100 }],
    ],
  },
];

async function main() {
  for (const m of modules) {
    const mod = await prisma.module.upsert({
      where: { id: m.title },
      update: {},
      create: { id: m.title, title: m.title, order: m.order },
    });
    for (const [smcpText, category, expectedAction] of m.phrases) {
      const id = `${mod.id}::${smcpText}`;
      await prisma.phrase.upsert({
        where: { id },
        update: { expectedAction },
        create: { id, moduleId: mod.id, smcpText, category, expectedAction },
      });
    }
  }
  console.log("Seed complete.");
}

main().finally(() => prisma.$disconnect());

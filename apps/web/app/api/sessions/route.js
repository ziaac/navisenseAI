import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  // demo user auto-provisioning keeps the flow friction-free
  const user = await prisma.user.upsert({
    where: { email: body.email ?? "cadet@demo.local" },
    update: {},
    create: { email: body.email ?? "cadet@demo.local", name: body.name ?? "Demo Cadet" },
  });
  const session = await prisma.session.create({
    data: { userId: user.id, scenario: body.scenario ?? "channel_navigation" },
  });
  return Response.json(session);
}

export async function GET() {
  const sessions = await prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { user: true, _count: { select: { attempts: true } } },
  });
  return Response.json(sessions);
}

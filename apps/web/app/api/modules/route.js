import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: { phrases: true },
  });
  return Response.json(modules);
}

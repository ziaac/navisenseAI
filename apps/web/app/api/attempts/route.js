import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Called by the brain service after each evaluated order.
export async function POST(req) {
  const body = await req.json();
  const attempt = await prisma.attempt.create({
    data: {
      sessionId: body.session_id,
      transcript: body.transcript,
      valid: body.smcp_valid,
      feedback: body.linguistic_feedback ?? "",
      action: body.physics_action ?? {},
      sttMs: body.stt_ms ?? 0,
      llmMs: body.latency_ms ?? 0,
    },
  });
  return Response.json(attempt);
}

export async function GET() {
  const attempts = await prisma.attempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json(attempts);
}

export const dynamic = "force-dynamic";

import { prisma } from "../../lib/db";

const box = {
  background: "rgba(10,26,42,0.9)", border: "1px solid #1e3a52",
  borderRadius: 10, padding: 20, marginBottom: 20,
};
const th = { textAlign: "left", padding: "6px 10px", color: "#7fa3bd", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 };
const td = { padding: "6px 10px", borderTop: "1px solid #14293d", fontSize: 14 };

export default async function Admin() {
  let modules = [], sessions = [], attempts = [], dbError = null;
  try {
    [modules, sessions, attempts] = await Promise.all([
      prisma.module.findMany({ orderBy: { order: "asc" }, include: { phrases: true } }),
      prisma.session.findMany({ orderBy: { startedAt: "desc" }, take: 10, include: { user: true, _count: { select: { attempts: true } } } }),
      prisma.attempt.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
  } catch (e) {
    dbError = String(e.message ?? e);
  }

  const validRate = attempts.length
    ? Math.round((attempts.filter((a) => a.valid).length / attempts.length) * 100)
    : null;

  return (
    <main style={{ padding: 32, height: "100vh", overflowY: "auto" }}>
      <h1 style={{ marginBottom: 4 }}>NaviSense AI — Instructor Dashboard</h1>
      <p style={{ color: "#7fa3bd", marginBottom: 24 }}>SMCP curriculum, training sessions and attempt telemetry</p>

      {dbError && (
        <div style={{ ...box, borderColor: "#7a2f2f" }}>
          <b>Database not reachable.</b> Set DATABASE_URL and run migrations.
          <div style={{ fontSize: 12, color: "#7fa3bd", marginTop: 6 }}>{dbError}</div>
        </div>
      )}

      <div style={box}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Curriculum ({modules.length} modules)</h2>
        {modules.map((m) => (
          <details key={m.id} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer" }}>{m.title} — {m.phrases.length} phrases</summary>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
              <thead><tr><th style={th}>Phrase</th><th style={th}>Category</th><th style={th}>Expected action</th></tr></thead>
              <tbody>
                {m.phrases.map((p) => (
                  <tr key={p.id}>
                    <td style={td}>{p.smcpText}</td>
                    <td style={td}>{p.category}</td>
                    <td style={td}><code style={{ fontSize: 12 }}>{JSON.stringify(p.expectedAction)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>
          Recent sessions {validRate !== null && <span style={{ color: "#6fe3a1" }}>· last-100 valid rate {validRate}%</span>}
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Cadet</th><th style={th}>Scenario</th><th style={th}>Started</th><th style={th}>Attempts</th><th style={th}>Score</th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={td}>{s.user.name}</td>
                <td style={td}>{s.scenario}</td>
                <td style={td}>{new Date(s.startedAt).toLocaleString()}</td>
                <td style={td}>{s._count.attempts}</td>
                <td style={td}>{s.score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Latest attempts</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Transcript</th><th style={th}>Valid</th><th style={th}>Feedback</th><th style={th}>STT</th><th style={th}>LLM</th></tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td style={td}>“{a.transcript}”</td>
                <td style={{ ...td, color: a.valid ? "#6fe3a1" : "#ff7b7b" }}>{a.valid ? "✓" : "✗"}</td>
                <td style={td}>{a.feedback}</td>
                <td style={td}>{a.sttMs} ms</td>
                <td style={td}>{a.llmMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

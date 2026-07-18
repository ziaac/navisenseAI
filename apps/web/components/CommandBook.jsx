"use client";

// Slide-out reference of every order the SMCP parser accepts.
// Clicking a phrase drops it into the order input via onPick.
// The toggle button lives in the left rail (page.jsx).
const SECTIONS = [
  {
    title: "Wheel Orders — Turn",
    items: [
      "Port five", "Port ten", "Port fifteen", "Port twenty",
      "Starboard five", "Starboard ten", "Starboard fifteen", "Starboard twenty",
      "Hard-a-port", "Hard-a-starboard",
    ],
  },
  {
    title: "Wheel Orders — Steady",
    items: ["Midships", "Steady as she goes"],
  },
  {
    title: "Engine Orders — Ahead",
    items: ["Dead slow ahead", "Slow ahead", "Half ahead", "Full ahead"],
  },
  {
    title: "Engine Orders — Astern / Stop",
    items: ["Dead slow astern", "Slow astern", "Half astern", "Full astern", "Stop engines"],
  },
  {
    title: "Combined (helm + engine)",
    items: ["Hard-a-port, ahead dead slow", "Starboard ten, half ahead", "Midships, full ahead"],
  },
];

export default function CommandBook({ open, onClose, onPick }) {
  return (
    <>
      <aside className={`book-panel ${open ? "open" : ""}`}>
        <div className="book-head">
          <div>
            <div className="book-title">SMCP Phrase Book</div>
            <div className="book-sub">IMO Standard Marine Communication Phrases — A1/6.2</div>
          </div>
          <button className="book-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="book-body">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <div className="book-section">{s.title}</div>
              <div className="book-chips">
                {s.items.map((p) => (
                  <button key={p} className="chip" onClick={() => onPick?.(p)} title="Insert into order bar">
                    {p}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="book-note">
            Click a phrase to place it in the order bar. Helm orders need headway
            (speed) before the ship answers the rudder.
          </div>
        </div>
      </aside>
    </>
  );
}

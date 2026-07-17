"use client";
import { useState } from "react";

// Slide-out reference of every order the SMCP parser accepts.
// Clicking a phrase drops it into the order input via onPick.
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

export default function CommandBook({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`book-toggle ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
        title="SMCP phrase book"
        aria-label="Toggle SMCP phrase book"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M9 7h7M9 11h7" />
        </svg>
      </button>

      <aside className={`book-panel ${open ? "open" : ""}`}>
        <div className="book-head">
          <div>
            <div className="book-title">SMCP Phrase Book</div>
            <div className="book-sub">IMO Standard Marine Communication Phrases — A1/6.2</div>
          </div>
          <button className="book-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
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

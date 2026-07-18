"use client";
import { useState } from "react";

// Info button (right edge, above the hand tool) opening a translucent
// "what is this app" popup.
export default function InfoPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="info-toggle"
        onClick={() => setOpen(true)}
        title="About this application"
        aria-label="About this application"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M12 11v5.2" />
          <circle cx="12" cy="7.8" r="0.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="info-backdrop" onClick={() => setOpen(false)}>
          <div className="info-popup" onClick={(e) => e.stopPropagation()}>
            <button className="info-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <div className="info-title">NAVISENSE <span>AI</span></div>
            <div className="info-sub">Embodied SMCP Training Environment</div>
            <div className="info-body">
              <p>
                A bridge simulator for practising <b>IMO Standard Marine Communication
                Phrases (SMCP)</b> — the standard English used for helm and engine
                orders at sea.
              </p>
              <ul>
                <li><b>Give an order</b> by voice (mic) or text, e.g. <i>“Hard-a-port, ahead dead slow”</i>.</li>
                <li>The <b>AI validates your phrasing</b> against the SMCP syllabus and coaches you when it is off-standard.</li>
                <li>Valid orders are executed by a <b>real-time ship physics simulation</b> — rudder rate, engine lag and hull hydrodynamics — so the vessel answers as it would at sea.</li>
                <li><b>NAV ADVISOR</b> tracks nearby traffic and hazards and recommends the correct order; the conn is still yours.</li>
                <li>Open the <b>phrase book</b> (book icon) for every supported order. The compass shows true heading; the amber mark is your view direction.</li>
              </ul>
              <p className="info-foot">EZi Edutech — maritime vocational training.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

// Translucent "what is this app" popup; the toggle button lives in the
// left rail (page.jsx).
export default function InfoPanel({ open, onClose }) {
  return (
    <>
      {open && (
        <div className="info-backdrop" onClick={onClose}>
          <div className="info-popup" onClick={(e) => e.stopPropagation()}>
            <button className="info-close" onClick={onClose} aria-label="Close">✕</button>
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

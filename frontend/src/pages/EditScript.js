import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

export default function EditScript() {
  const { state }   = useLocation();         // may contain { prompt } or { script }
  const navigate    = useNavigate();

  /* ---------- read incoming data (if any) ---------- */
  const originalPrompt  = state?.prompt;     // present on FIRST visit
  const incomingScript  = state?.script;     // present when user clicks "Back" from /style

  const [script, setScript]   = useState(incomingScript || '');
  const [loading, setLoading] = useState(!incomingScript);  // skip spinner if we already have a script

  /* ---------- generate script only the first time ---------- */
  useEffect(() => {
    if (incomingScript) return;              // already have text → nothing to do

    if (!originalPrompt) {                   // user refreshed page w/out state
      navigate('/');
      return;
    }

    const timer = setTimeout(() => {
      setScript(
`### Auto-generated script for: "${originalPrompt}"

1. **Hook** – interesting opener  
2. **Body** – main talking points  
3. **CTA**  – ask viewers to like/follow`
      );
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [incomingScript, originalPrompt, navigate]);

  /* ---------- UI while "API" call is running ---------- */
  if (loading) {
    return (
      <div className="App dark-theme">
        <header className="App-header">
          <div className="logo clickable" onClick={() => navigate('/')}>
            🎭 Faceless
          </div>
        </header>
        <p style={{ textAlign: 'center', marginTop: '30vh' }}>
          Generating your script…
        </p>
      </div>
    );
  }

  /* ---------- handlers ---------- */
  const handleContinue = () =>
    navigate('/style', { state: { script } });      // pass the edited script forward

  /* ---------- render ---------- */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          🎭 Faceless
        </div>
      </header>

      <main className="main-content">
        <h1>Edit your Script</h1>
        <p>Tweak anything you like, then continue to the art-style picker</p>

        <div className="chat-container">
          <div className="chat-input-wrapper tall">
            <textarea
              placeholder="Edit your full script here…"
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />

            <div className="chat-controls">
              <div className="chat-buttons-left">
                <button
                  className="chat-btn"
                  onClick={() => navigate('/')}
                >
                  Back
                </button>
              </div>

              <button className="send-btn" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

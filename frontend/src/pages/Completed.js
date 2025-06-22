// Completed.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import '../App.css';                 // ← keeps your shared styles

export default function Completed() {
  const navigate       = useNavigate();
  const { state }      = useLocation();          // expect { videoUrl }
  const videoUrl       = state?.videoUrl || '';  // guard for direct hits
  const [showConfetti, setShowConfetti] = useState(true);

  /* hide confetti after 3 s */
  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 10000);
    return () => clearTimeout(t);
  }, []);

  if (!videoUrl) {
    return (
      <div className="App dark-theme">
        <header className="App-header">
          <div className="logo clickable" onClick={() => navigate('/')}>Faceless.AI</div>
        </header>
        <main className="main-content" style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Missing&nbsp;video</h1>
          <p>We couldn’t find that video. Please return home.</p>
          <button className="chat-btn" onClick={() => navigate('/')}>Go&nbsp;Home</button>
        </main>
      </div>
    );
  }

  /* normal success render */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>Faceless.AI</div>
      </header>

      {/* confetti appears for 3 s on mount */}
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          numberOfPieces={160}
          recycle={false}
        />
      )}

      <main className="main-content" style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>Video&nbsp;Completed!</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>Enjoy your creation 🎉</p>

        <video
          src={videoUrl}
          controls
          style={{ width: '100%', maxWidth: 270, borderRadius: 16 }}
        />

        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="send-btn"
          style={{ marginTop: 24 }}
        >
          Download
        </a>

        <button
          className="chat-btn"
          onClick={() => navigate('/')}
          style={{ marginTop: 32 }}
        >
          Go&nbsp;Home
        </button>
      </main>
    </div>
  );
}

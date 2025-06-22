import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

const narrators = [
  { id: 'narrator1', name: 'David', desc: 'Deep, resonant male voice', imgSrc: 'https://via.placeholder.com/180x160', mp3: 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3' },
  { id: 'narrator2', name: 'Sarah', desc: 'Clear, friendly female voice', imgSrc: 'https://via.placeholder.com/180x160', mp3: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3' },
  { id: 'narrator3', name: 'Robo', desc: 'Synthetic AI narrator', imgSrc: 'https://via.placeholder.com/180x160', mp3: 'https://samplelib.com/lib/preview/mp3/sample-9s.mp3' },
];

export default function SelectNarrator() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [selectedNarrator, setSelectedNarrator] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const audioRefs = useRef({});

  const togglePlay = (id) => {
    const currentAudio = audioRefs.current[id];
    if (!currentAudio) return;

    // Pause other audio if one is playing
    if (playingId && playingId !== id) {
      audioRefs.current[playingId].pause();
    }
    
    // Toggle current audio
    if (playingId === id) {
      currentAudio.pause();
      setPlayingId(null);
    } else {
      currentAudio.currentTime = 0;
      currentAudio.play();
      setPlayingId(id);
    }
  };

  const handleContinue = () => {
    // Logic to proceed to the next step
    console.log('Final state:', { ...state, narrator: selectedNarrator });
  };

  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          🎭 Faceless
        </div>
      </header>
      <main className="main-content">
        <h1>Select a Narrator</h1>
        <p>Preview each voice and pick your favourite.</p>
        <div className="style-grid">
          {narrators.map(narrator => (
            <div
              key={narrator.id}
              className={`style-card ${selectedNarrator === narrator.id ? 'selected' : ''}`}
              onClick={() => setSelectedNarrator(narrator.id)}
            >
              <audio
                src={narrator.mp3}
                ref={el => (audioRefs.current[narrator.id] = el)}
                onEnded={() => setPlayingId(null)}
              />
              <img src={narrator.imgSrc} alt={narrator.name} />
              <span>{narrator.name}</span>
              <p style={{padding: '0 0.5rem 0.5rem', margin: 0, fontSize: '0.9rem', color: '#ccc'}}>{narrator.desc}</p>
              <button
                className="chat-btn"
                style={{marginBottom: '1rem'}}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay(narrator.id);
                }}
              >
                {playingId === narrator.id ? '⏸ Pause' : '▶ Play'}
              </button>
            </div>
          ))}
        </div>
        <div className="page-nav-buttons">
          <button className="chat-btn" onClick={() => navigate('/style', { state })}>
            Back
          </button>
          <button className="send-btn" onClick={handleContinue} disabled={!selectedNarrator}>
            Finish &amp; Generate
          </button>
        </div>
      </main>
    </div>
  );
}

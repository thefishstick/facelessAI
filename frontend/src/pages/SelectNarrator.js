// SelectNarrator.js
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';          // ← shared stylesheet

export default function SelectNarrator() {
  /* ───────── routing */
  const { state: locationState } = useLocation();   // contains: prompt & style
  const navigate                 = useNavigate();

  /* ───────── local state */
  const [narrators,      setNarrators]      = useState([]);   // fetched rows
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [chosen,         setChosen]         = useState(null); // full row
  const [playingId,      setPlayingId]      = useState(null); // which sample is playing?
  const audioRefs = useRef({});                              // { audio_id : <audio> }

  /* ───────── fetch narrators (once) */
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('https://faceless-api-f472a10c9d1f.herokuapp.com/api/fetchNarrators');
        const json = await res.json();
        if (!json.narrators) throw new Error(json.error || 'No data');
        setNarrators(json.narrators);
      } catch (err) {
        console.error(err);
        setError('Unable to load narrators. Please try again later.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ───────── play / pause sample */
  const togglePlay = (audioId) => {
    const el = audioRefs.current[audioId];
    if (!el) return;

    // pause any other sample
    if (playingId && playingId !== audioId) {
      audioRefs.current[playingId]?.pause();
    }

    if (playingId === audioId) {
      el.pause();
      setPlayingId(null);
    } else {
      el.currentTime = 0;
      el.play();
      setPlayingId(audioId);
    }
  };

  /* ───────── continue → Editor */
  const handleContinue = () => {
    if (!chosen) return;

    console.log("audio chosen", chosen.audio_id)

    navigate('/editor', {
      state: {
        ...locationState,        // prompt & style from previous screen
        narrator_id: chosen.audio_id
      }
    });
  };

  /* ───────── helpers */
  const Loader = () => (
    <div style={{ marginTop: 40 }}>
      <div className="spinner" />
    </div>
  );

  /* ───────── render */
  return (
    <div className="App dark-theme">
      {/* ─── header ─── */}
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          Faceless.AI
        </div>
      </header>

      {/* ─── main ─── */}
      <main className="main-content">
        <h1>Select&nbsp;a&nbsp;Narrator</h1>
        <p>Preview each voice and pick your favourite.</p>

        {loading && <Loader />}
        {error   && <p style={{ color: 'tomato' }}>{error}</p>}

        {!loading && !error && (
          <div className="style-grid">
            {narrators.map((n) => (
              <div
                key={n.audio_id}
                className={`style-card ${
                  chosen?.audio_id === n.audio_id ? 'selected' : ''
                }`}
                onClick={() => setChosen(n)}
                
              >
                {/* hidden audio for preview */}
                <audio
                  src={n.audio_url}
                  ref={(el) => (audioRefs.current[n.audio_id] = el)}
                  onEnded={() => setPlayingId(null)}
                />

                <img src={n.thumbnail_url} alt={n.ui_name} />
                <span>{n.ui_name}</span>
                <p
                  style={{
                    padding: '0 0.5rem 0.5rem',
                    margin: 0,
                    fontSize: '0.9rem',
                    color: '#ccc'
                  }}
                >
                  {n.audio_description}
                </p>

                <button
                  className="chat-btn"
                  style={{ marginBottom: '0.75rem' }}
                  onClick={(e) => {
                    e.stopPropagation();        // don’t trigger card selection
                    togglePlay(n.audio_id);
                  }}
                >
                  {playingId === n.audio_id ? '⏸ Pause' : '▶ Play'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* navigation */}
        <div className="page-nav-buttons">
          <button
            className="chat-btn"
            onClick={() => navigate('/style', { state: locationState })}
          >
            Back
          </button>

          <button
            className="send-btn"
            onClick={handleContinue}
            disabled={!chosen}
          >
            Finish&nbsp;&amp;&nbsp;Generate
          </button>
        </div>
      </main>
    </div>
  );
}

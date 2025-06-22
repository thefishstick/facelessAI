// ChooseStyle.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';                      // keep using the shared stylesheet

export default function ChooseStyle() {
  /* -------------------------------------------------- routing helpers */
  const { state: locationState } = useLocation();     // ← could contain { prompt }
  const navigate                 = useNavigate();

  /* -------------------------------------------------- local state */
  const [styles,  setStyles]       = useState([]);      // rows from Back4App
  const [loading, setLoading]      = useState(true);
  const [error,   setError]        = useState('');
  const [chosen,  setChosen]       = useState(null);    // selected style row

  /* -------------------------------------------------- fetch styles once */
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const res  = await fetch('http://127.0.0.1:5000/api/fetchStyles');
        const json = await res.json();
        if (!json.styles) throw new Error(json.error || 'No data');
        setStyles(json.styles);
      } catch (err) {
        console.error(err);
        setError('Unable to load styles. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchStyles();
  }, []);

  /* -------------------------------------------------- continue → narrator */
  const handleContinue = () => {
    if (!chosen) return;

    /* make absolutely sure the prompt survives the hop */
    const prompt         = locationState?.prompt || '';   // fallback empty

    console.log("HERE IS PROMPT:", prompt)
    const carryForward   = { prompt, style: chosen };

    console.log("HERE IS STYLE:", chosen)

    navigate('/narrator', { state: carryForward });
  };

  /* -------------------------------------------------- tiny helpers */
  const Loader = () => (
    <div style={{ marginTop: 32 }}>
      <div className="spinner" />
    </div>
  );

  /* -------------------------------------------------- render */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          Faceless.AI
        </div>
      </header>

      <main className="main-content">
        <h1>Choose an Art Style</h1>
        <p>Select your favorite visual style for the video.</p>

        {loading && <Loader />}
        {error   && <p style={{ color: 'tomato' }}>{error}</p>}

        {!loading && !error && (
          <div className="style-grid">
            {styles.map(style => (
              <div
                key={style.objectId}
                className={`style-card ${chosen?.objectId === style.objectId ? 'selected' : ''}`}
                onClick={() => setChosen(style)}
              >
                <img src={style.thumbnail_url} alt={style.prompt_name} />
                <span>{style.prompt_name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="page-nav-buttons">
          <button className="chat-btn" onClick={() => navigate('/')}>
            Back
          </button>
          <button
            className="send-btn"
            onClick={handleContinue}
            disabled={!chosen}
          >
            Continue
          </button>
        </div>
      </main>
    </div>
  );
}

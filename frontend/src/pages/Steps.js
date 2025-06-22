// Steps.js  –– pick *Style*  +  *Narrator* in one screen (smooth & glitch-free)
import React, { useEffect, useState, useRef, memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

/* ---------- one generic memo-ised card ---------- */
const CARD_W = 150;                             // change size once here

const Card = memo(
  function Card({ id, img, title, selected, playing, circular, onClick, children }) {
    return (
      <div
        onClick={onClick}
        style={{
          width: CARD_W,
          flexShrink: 0,
          cursor: 'pointer',
          outline: selected ? '3px solid #4f8aff' : '3px solid transparent',
          outlineOffset: 0,
          borderRadius: 10,
          transition: 'outline-color .15s',
          boxSizing: 'border-box',
        }}
      >
        <img
          src={img}
          alt={title}
          style={{
            width:  circular ? '70%' : '100%',
            borderRadius: circular ? '50%' : 7,
            aspectRatio: circular ? '1/1' : undefined,
            objectFit: circular ? 'cover' : undefined,
          }}
        />
        <span style={{ display: 'block', padding: '6px 0' }}>{title}</span>
        {children}
      </div>
    );
  },

  /* re-render this card **only** if its own flags change */
  (prev, next) =>
    prev.selected === next.selected && prev.playing === next.playing
);

/* ---------- helper components ---------- */
const Row = ({ children }) => (
  <div
    style={{
      display: 'flex',
      gap: 20,
      overflowX: 'auto',
      padding: '8px 0 28px',
      scrollbarWidth: 'thin',
    }}
  >
    {children}
  </div>
);

const Loader = () => (
  <div style={{ marginTop: 32 }}>
    <div className="spinner" />
  </div>
);

/* ======================================================================= */
export default function Steps() {
  /* routing */
  const { state } = useLocation();                 // { prompt }
  const prompt = state?.prompt || '';
  const navigate = useNavigate();

  /* remote data */
  const [styles, setStyles] = useState([]);
  const [narrs, setNarrs] = useState([]);
  const [loadSt, setLoadSt] = useState(true);
  const [loadNa, setLoadNa] = useState(true);
  const [errSt, setErrSt] = useState('');
  const [errNa, setErrNa] = useState('');

  /* selections */
  const [selStyleId, setSelStyleId] = useState(null);
  const [selNarrId, setSelNarrId] = useState(null);
  const selStyleObj = useRef(null);
  const selNarrObj = useRef(null);

  /* audio */
  const [playingId, setPlayingId] = useState(null);
  const audioRefs = useRef({});

  /* ---------------- fetch once ---------------- */
  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/fetchStyles')
      .then(r => r.json())
      .then(j => {
        if (!j.styles) throw new Error(j.error);
        setStyles(j.styles);
      })
      .catch(() => setErrSt('Unable to load styles'))
      .finally(() => setLoadSt(false));

    fetch('http://127.0.0.1:5000/api/fetchNarrators')
      .then(r => r.json())
      .then(j => {
        if (!j.narrators) throw new Error(j.error);
        setNarrs(j.narrators);
      })
      .catch(() => setErrNa('Unable to load narrators'))
      .finally(() => setLoadNa(false));
  }, []);

  /* ---------------- audio preview ---------------- */
  const togglePlay = id => {
    const el = audioRefs.current[id];
    if (!el) return;
    if (playingId && playingId !== id) audioRefs.current[playingId]?.pause();

    if (playingId === id) {
      el.pause();
      setPlayingId(null);
    } else {
      el.currentTime = 0;
      el.play();
      setPlayingId(id);
    }
  };

  /* ---------------- continue ---------------- */
  const goNext = () => {
    if (!selStyleObj.current || !selNarrObj.current) return;
    navigate('/editor', {
      state: {
        prompt,
        style: selStyleObj.current,
        narrator_id: selNarrObj.current.audio_id,
      },
    });
  };

  /* ---------------- render ---------------- */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          Faceless.AI
        </div>
      </header>

      <main className="main-content">
        {/* --------- styles --------- */}
        <h1>Choose an Art Style</h1>
        <p>Select the look for your video</p>

        {loadSt ? (
          <Loader />
        ) : errSt ? (
          <p style={{ color: 'tomato' }}>{errSt}</p>
        ) : (
          <Row>
            {styles.map(s => (
              <Card
                key={s.objectId}
                id={s.objectId}
                img={s.thumbnail_url}
                title={s.prompt_name}
                selected={selStyleId === s.objectId}
                onClick={() => {
                  setSelStyleId(s.objectId);
                  selStyleObj.current = s;
                }}
              />
            ))}
          </Row>
        )}

        {/* --------- narrators --------- */}
        <h1>Select a Narrator</h1>
        <p>Preview a voice & pick your favourite</p>

        {loadNa ? (
          <Loader />
        ) : errNa ? (
          <p style={{ color: 'tomato' }}>{errNa}</p>
        ) : (
          <Row>
            {narrs.map(n => (
              <Card
                key={n.audio_id}
                id={n.audio_id}
                img={n.thumbnail_url}
                title={n.ui_name}
                circular
                selected={selNarrId === n.audio_id}
                playing={playingId === n.audio_id}
                onClick={() => {
                  setSelNarrId(n.audio_id);
                  selNarrObj.current = n;
                }}
              >
                <audio
                  src={n.audio_url}
                  ref={el => (audioRefs.current[n.audio_id] = el)}
                  onEnded={() => setPlayingId(null)}
                />
                <button
                  className="chat-btn"
                  style={{ margin: '6px 0', fontSize: 12 }}
                  onClick={e => {
                    e.stopPropagation();
                    togglePlay(n.audio_id);
                  }}
                >
                  {playingId === n.audio_id ? '⏸ Pause' : '▶ Play'}
                </button>
              </Card>
            ))}
          </Row>
        )}

        {/* --------- navigation --------- */}
        <div className="page-nav-buttons">
          <button className="chat-btn" onClick={() => navigate('/')}>
            Back
          </button>
          <button
            className="send-btn"
            disabled={!selStyleId || !selNarrId}
            onClick={goNext}
          >
            Continue
          </button>
        </div>
      </main>
    </div>
  );
}

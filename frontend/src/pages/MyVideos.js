// MyVideos.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function MyVideos() {
  const navigate       = useNavigate();
  const USER_ID        = '1';                // ← replace with real user id / auth
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  /* ───────────────────────── fetch on mount */
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('http://127.0.0.1:5000/api/fetchVideos', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({ user_id: USER_ID })
        });
        const json = await res.json();
        if (!json.videos) throw new Error(json.error || 'No data');
        setVideos(json.videos);              // [{ video_url, video_status, created_at }, …]
      } catch (err) {
        console.error(err);
        setError('Unable to load your videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ───────────────────────── helpers */
  const SpinnerFrame = () => (
    <div
      style={{
        width: 270,
        height: 460,
        background: '#0a0a0a',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div className="spinner" />
    </div>
  );

  /* ───────────────────────── render */
  return (
    <div className="App dark-theme">
      {/* header (same everywhere) */}
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>Faceless.AI</div>
        <button
          className="profile-btn"
          onClick={() => navigate('/')}
          aria-label="Back home"
        />
      </header>

      <main className="main-content" style={{ textAlign:'left' }}>
        <h1 style={{ marginBottom:12 }}>My Videos</h1>
        <p style={{ marginBottom:32, opacity:.85 }}>
          All the videos you’ve generated will appear here.
        </p>

        {loading && (
          <div style={{ marginTop:40, textAlign:'center' }}>
            <div className="spinner" />
          </div>
        )}

        {error && <p style={{ color:'tomato' }}>{error}</p>}

        {/* 🆕  Fallback when there are no videos */}
        {!loading && !error && videos.length === 0 && (
          <div style={{ textAlign:'center', marginTop:60 }}>
            <p style={{ opacity:.8, marginBottom:24 }}>You haven’t created any videos yet.</p>
            <button
              className="send-btn"
              onClick={() => navigate('/')}
            >
              🎬 Make a Video
            </button>
          </div>
        )}

        {/* regular grid when we do have videos */}
        {!loading && !error && videos.length > 0 && (
          <div className="videos-grid">
            {videos.map(v => (
              <div
                key={v.video_id}
                className="video-tile"
                style={{ cursor: v.video_status === 'completed' ? 'pointer' : 'default' }}
                onClick={() => {
                  if (v.video_status === 'completed') {
                    navigate('/completed', { state:{ videoUrl: v.video_url } });
                  }
                }}
              >
                {v.video_status === 'completed' ? (
                  <video
                    src={v.video_url}
                    muted
                    loop
                    playsInline
                    autoPlay
                  />
                ) : (
                  <SpinnerFrame />
                )}

                <div
                  className="video-info-row"
                  style={{ textAlign:'center', marginTop:8 }}
                >
                  {v.video_status === 'completed'
                    ? new Date(v.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
                    : 'Generating…'}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Home.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

/* ───────── constants ───────── */
const USER_ID = '1';   // TODO: replace with real authenticated user id

const scriptTemplates = [
  "What if an AI developed true consciousness and asked for human rights?",
  "Is it possible that our reality is just an advanced computer simulation?",
  "What if archaeologists discovered a 50,000-year-old advanced city frozen in Antarctica?",
  "What if a secret deep-space program confirmed an alien message but the government is hiding it?",
  "Should the super-rich be allowed to upload their consciousness and live forever while others cannot?"
];

const placeholderPrompts = [
  "the lost city of Atlantis…",
  "what if dinosaurs never went extinct…",
  "the simulation theory…"
];

export default function Home() {
  /* ───────── ui state ───────── */
  const [prompt,       setPrompt]       = useState('');
  const [placeholder,  setPlaceholder]  = useState('Create a video about…');
  const [promptIndex,  setPromptIndex]  = useState(0);
  const [subIndex,     setSubIndex]     = useState(0);
  const [isDeleting,   setIsDeleting]   = useState(false);

  /* 🔴 pending-videos badge */
  const [pending,      setPending]      = useState(0);   // number of ‘pending’ videos

  const navigate = useNavigate();

  /* ───────── typewriter placeholder ───────── */
  useEffect(() => {
    if (isDeleting ? subIndex === 0 : subIndex === placeholderPrompts[promptIndex].length) {
      setTimeout(() => setIsDeleting(!isDeleting), 1500);
      if (!isDeleting) return;               // pause before deleting
      if (isDeleting && subIndex === 0) {
        setPromptIndex((i) => (i + 1) % placeholderPrompts.length);
      }
    }

    const timer = setTimeout(() => {
      setSubIndex((i) => i + (isDeleting ? -1 : 1));
    }, isDeleting ? 20 : 40);

    return () => clearTimeout(timer);
  }, [subIndex, isDeleting, promptIndex]);

  useEffect(() => {
    setPlaceholder(
      'Ask Faceless to create a video about ' +
      placeholderPrompts[promptIndex].substring(0, subIndex)
    );
  }, [subIndex, promptIndex]);

  /* ───────── fetch pending-video count once ───────── */
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('http://127.0.0.1:5000/api/fetchVideos', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({ user_id: USER_ID })
        });
        const json = await res.json();
        if (json.videos) {
          const cnt = json.videos.filter(v => v.video_status === 'pending').length;
          setPending(cnt);
        }
      } catch {/* ignore – badge simply won’t show */ }
    })();
  }, []);

  /* ───────── handlers ───────── */
  const handleCreateVideo = () => {
    if (!prompt.trim()) return;
    navigate('/style', { state: { prompt } });
  };

  const handleRollTheDice = () => {
    setPrompt(scriptTemplates[Math.floor(Math.random() * scriptTemplates.length)]);
  };

  /* ───────── sample community carousel (static) ───────── */
  const sampleVids = [
    { url:'https://dcuyywmc95nls.cloudfront.net/EN/2compress.mp4', views:'932.9K' },
    { url:'https://dcuyywmc95nls.cloudfront.net/EN/6compress.mp4', views:'12.2M' },
    { url:'https://dcuyywmc95nls.cloudfront.net/EN/4compress.mp4', views:'1.2M' },
    { url:'https://dcuyywmc95nls.cloudfront.net/EN/5compress.mp4', views:'1.5M' },
    { url:'https://home-vexub.s3.eu-west-3.amazonaws.com/EN/3compress.mp4', views:'230K' },
    { url:'https://dcuyywmc95nls.cloudfront.net/EN/1compress.mp4', views:'421K' }
  ];
  const duplicated = [...sampleVids, ...sampleVids];     // infinite-scroll illusion

  /* ───────── render ───────── */
  return (
    <div className="App homepage">
      {/* ── header ── */}
      <header className="App-header">
        <div className="logo" onClick={() => navigate('/')}>Faceless.AI</div>

        {/* profile icon + badge */}
        <button
          className="profile-btn"
          onClick={() => navigate('/my-videos')}
          aria-label="My videos"
          style={{ position:'relative' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>

          {/* red badge only when pending > 0 */}
          {pending > 0 && (
            <span style={{
              position:'absolute',
              top:-4, right:-4,
              minWidth:18, height:24,
              padding:'0 4px',
              background:'#e64646',
              color:'#fff',
              fontSize:12,
              lineHeight:'18px',
              borderRadius:'50%',
              fontWeight:600,
              display:'flex',
              alignItems:'center',
              justifyContent:'center'
            }}>
              {pending}
            </span>
          )}
        </button>
      </header>

      {/* ── hero ── */}
      <main className="main-content">
        <h1>Be a Creator - without ever needing to film</h1>
        <p>Create faceless viral content by chatting with AI</p>

        <div className="chat-container">
          <div className="chat-input-wrapper">
            <textarea
              placeholder={placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="chat-controls">
              <button className="chat-btn" onClick={handleRollTheDice}>
                {/* dice icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                     viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5"  cy="8.5"  r="1.5" fill="currentColor"/>
                  <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
                  <circle cx="15.5" cy="8.5"  r="1.5" fill="currentColor"/>
                  <circle cx="8.5"  cy="15.5" r="1.5" fill="currentColor"/>
                </svg>
              </button>

              <button
                className="send-btn"
                onClick={handleCreateVideo}
                disabled={!prompt.trim()}
              >
                {/* arrow-up icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                     viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── community carousel ── */}
      <section className="community-section">
        <div className="video-carousel">
          {duplicated.map((v, i) => (
            <div key={i} className="video-card">
              <video className="video-bg"
                     src={v.url}
                     muted
                     autoPlay
                     loop
                     playsInline />
              <div className="video-card-content">
                <div className="video-info">▷ {v.views}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// FinalOutput.js
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

/* ------------ tiny one-off confetti component ------------ */
const ConfettiBurst = () => {
  const pieces = Array.from({ length: 120 });
  return (
    <div style={{
      pointerEvents: 'none',
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      zIndex: 9999
    }}>
      {pieces.map((_, i) => {
        const size  = 6 + Math.random() * 6;           // 6-12 px
        const left  = Math.random() * 100;             // %
        const delay = Math.random() * 0.3;             // s
        const dur   = 2.7 + Math.random() * 0.6;       // s
        const bg    = `hsl(${Math.random()*360}deg,90%,55%)`;
        const rotate= Math.random()*360;
        return (
          <span
            key={i}
            style={{
              position:'absolute',
              top:'-10px',
              left:`${left}%`,
              width:size, height:size,
              background:bg,
              borderRadius:2,
              transform:`rotate(${rotate}deg)`,
              animation:`fall ${dur}s ${delay}s ease-out forwards`
            }}
          />
        );
      })}
      {/* keyframes inline so we don’t touch your CSS file */}
      <style>{`
        @keyframes fall{
          to{
            transform:translateY(110vh) rotate(720deg);
            opacity:0;
          }
        }
      `}</style>
    </div>
  );
};

export default function FinalOutput() {
  const navigate  = useNavigate();
  const { state } = useLocation();
  const pollRef   = useRef(null);
  const startedRef = useRef(false);

  /* pull what we need out of state */
  const {
    script    = '',
    images    = [],
    audioUrls = [],
    prompt    = 'temp',
    style     = null,
    user_id   = '1'
  } = state || {};

  /* ─── local state ─── */
  const [stage,       setStage]   = useState('starting'); // starting ▸ waiting ▸ done ▸ error
  const [videoUrl,    setVideo]   = useState('');
  const [error,       setError]   = useState('');
  const [showConfetti,setConfetti]= useState(false);

  /* ─── start compile on mount ─── */
  useEffect(() => {

    if (startedRef.current) return;
    startedRef.current = true;

    if (!script || !images.length || !audioUrls.length) {
      setError('Nothing to render – return to editor.');
      setStage('error');
      return;
    }

    const startJob = async () => {
      try {
        const res = await fetch('https://faceless-api-f472a10c9d1f.herokuapp.com/api/compile-video', {
          method :'POST',
          headers:{ 'Content-Type':'application/json' },
          body   : JSON.stringify({
            user_id,
            prompt,
            style_prompt : style?.prompt || 'temp',
            script,
            images,
            audio_urls : audioUrls
          })
        });

        const { job_id, error: apiErr } = await res.json();
        if (!job_id) throw new Error(apiErr || 'Failed to start render job');
        setStage('waiting');

        const poll = async () => {
          const r = await fetch(`https://faceless-api-f472a10c9d1f.herokuapp.com/api/video-status/${job_id}`);
          const j = await r.json();

          if (j.status === 'done') {
            clearTimeout(pollRef.current);
            pollRef.current = null;
            setVideo(j.video_url);
            setStage('done');
            /* trigger confetti for 3 s */
            setConfetti(true);
            setTimeout(() => setConfetti(false), 3000);
          } else if (j.status === 'error') {
            clearTimeout(pollRef.current);
            pollRef.current = null;
            setError(j.error || 'Render failed.');
            setStage('error');
          } else {
            pollRef.current = setTimeout(poll, 3500);
          }
        };
        poll();
      } catch (err) {
        console.error(err);
        setError(err.message);
        setStage('error');
      }
    };

    startJob();
    return () => pollRef.current && clearTimeout(pollRef.current);
  }, [script, images, audioUrls, prompt, style, user_id]);

  /* ─── helpers ─── */
  const PhoneFrame = ({ msg }) => (
    <>
      <div
        style={{
          width:270,height:480,background:'#0a0a0a',borderRadius:16,
          display:'flex',alignItems:'center',justifyContent:'center',
          margin:'32px auto'
        }}
      >
        <div className="spinner" />
      </div>
      <p style={{ fontSize:18, opacity:0.85 }}>{msg}</p>
    </>
  );

  /* ─── dynamic title / subtitle ─── */
  const titleText   = stage === 'done' ? 'Video Completed!' : 'Generating your video…';
  const subtitleTxt = stage === 'done' ? 'Enjoy your creation' : 'See your creation';

  /* ─── render ─── */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>Faceless.AI</div>
      </header>

      <main className="main-content" style={{ textAlign:'center' }}>
        <h1 style={{ marginBottom:8 }}>{titleText}</h1>
        <p style={{ marginTop:0, opacity:0.8 }}>{subtitleTxt}</p>

        {stage === 'starting' && <PhoneFrame msg="Starting render…" />}
        {stage === 'waiting'  && <PhoneFrame msg="Rendering, please wait…" />}
        {stage === 'error'    && <p style={{ color:'tomato' }}>{error}</p>}

        {stage === 'done' && videoUrl && (
          <>
            <video
              src={videoUrl}
              controls
              style={{ width:'100%', maxWidth:270, borderRadius:16 }}
            />
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="send-btn"
              style={{ marginTop:24 }}
            >
              Download
            </a>
          </>
        )}

        {/* always-visible nav */}
        <button
          className="chat-btn"
          onClick={() => navigate('/')}
          style={{ marginTop:32 }}
        >
          Go&nbsp;Home
        </button>
      </main>

      {/* confetti */}
      {showConfetti && <ConfettiBurst />}
    </div>
  );
}

// Editor.js
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';   // ← need location
import '../App.css';

export default function Editor() {
  const navigate      = useNavigate();
  const { state }     = useLocation();     // { style: { prompt, … } } from ChooseStyle
  const pollRef       = useRef(null);

  /* ───────── state ───────── */
  const [script,    setScript]    = useState('');
  const [sentences, setSentences] = useState([]);
  const [images,    setImages]    = useState([]);
  const [audioUrls, setAudioUrls] = useState([]);
  const [error,     setError]     = useState('');
  const [stage,     setStage]     = useState('initial'); // initial ▸ images ▸ audio ▸ ready ▸ error

  /* grab the style prompt (may be undefined if user skipped the page) */
  const stylePrompt = state?.style?.prompt || '';        // 👉 this is what we’ll send


  /* ───────── pipeline ───────── */
  useEffect(() => {
    
    const run = async () => {
      
      try {
        /* 1️⃣ generate script */
        const sRes  = await fetch('http://127.0.0.1:5000/api/generate-script', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({ prompt: state.prompt })
        });

        console.log("state.prompt in editor:", stylePrompt)
        const sJson = await sRes.json();
        if (!sJson.script) throw new Error(sJson.error || 'Script generation failed');
        setScript(sJson.script);

        /* 2️⃣ fire image-generation job (⇒ pass the style prompt) */
        const imgJobRes = await fetch('http://127.0.0.1:5000/api/generate-images', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({
            script       : sJson.script,
            style_prompt : stylePrompt      // ← NEW field sent to backend
          })
        });
        const { job_id } = await imgJobRes.json();
        if (!job_id) throw new Error('Image job did not return job_id');
        setStage('images');

        /* poll until images are ready */
        const pollImages = async () => {
          const stRes  = await fetch(`http://127.0.0.1:5000/api/image-status/${job_id}`);
          const stJson = await stRes.json();

          if (stJson.status === 'done') {
            clearTimeout(pollRef.current);
            setImages(stJson.images);
            setSentences(stJson.sentences);

            /* 3️⃣ generate audio per sentence */
            setStage('audio');
            const audios = await Promise.all(
              stJson.sentences.map(async txt => {
                const r = await fetch('http://127.0.0.1:5000/api/generate-audio', {
                  method : 'POST',
                  headers: { 'Content-Type':'application/json' },
                  body   : JSON.stringify({ text: txt })
                });
                const j = await r.json();
                return j.audio_url ?? null;
              })
            );
            setAudioUrls(audios);
            setStage('ready');
          } else {
            pollRef.current = setTimeout(pollImages, 3000);
          }
        };
        pollImages();

      } catch (e) {
        console.error(e);
        setError(e.message);
        setStage('error');
      }
    };

    run();
    return () => pollRef.current && clearTimeout(pollRef.current);
  }, [stylePrompt]);   // rerun only if style prompt ever changes

  /* ───────── loaders ───────── */
  const PhoneFrame = () => (
    <div style={{
      width:270, height:480, background:'#0a0a0a', borderRadius:16,
      display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div className="spinner" />
    </div>
  );

  const LoaderStrip = () => (
    <div style={{ display:'flex', gap:50, overflowX:'auto', padding:'0 12px', marginTop:40 }}>
      {Array.from({ length:5 }).map((_,i)=><PhoneFrame key={i}/>)}
    </div>
  );

  /* ───────── dynamic title/subtitle ───────── */
  const pageTitle    = stage === 'ready' ? 'Edit your scenes'           : 'Generating your scenes…';
  const pageSubTitle = stage === 'ready' ? 'Customize each frame of your video'
                                         : 'This should only take a moment…';

  /* ───────── render ───────── */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={()=>navigate('/')}>Faceless.AI</div>
      </header>

      <main className="main-content">
        <h1>{pageTitle}</h1>
        <p>{pageSubTitle}</p>

        {error && <p style={{ color:'tomato' }}>{error}</p>}

        {stage !== 'ready' && <LoaderStrip />}

        {stage === 'ready' && (
          <div style={{ display:'flex', gap:50, overflowX:'auto', marginTop:40 }}>
            {sentences.map((txt,i)=>(
              <div key={i} style={{ width:270, flexShrink:0, textAlign:'center' }}>
                <img src={images[i]} alt="" style={{ width:'100%', borderRadius:16 }} />
                <p style={{ margin:'20px 0' }}>{txt}</p>
                {/* audio preview intentionally commented out */}
              </div>
            ))}
          </div>
        )}

        {stage === 'ready' && (
          <button
            className="send-btn"
            style={{ marginTop:50 }}
            onClick={()=>navigate('/final', { state:{ script, images, audioUrls } })}
          >
            🎬 Create Final Video
          </button>
        )}
      </main>
    </div>
  );
}

// Editor.js
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../App.css';

export default function Editor() {
  const navigate        = useNavigate();
  const { state }       = useLocation();     // { prompt, style:{ prompt,… } }
  const pollRef         = useRef(null);

  /* ───────── pipeline state ───────── */
  const [script,    setScript]    = useState('');
  const [sentences, setSentences] = useState([]);
  const [images,    setImages]    = useState([]);
  const [audioUrls, setAudioUrls] = useState([]);
  const [stage,     setStage]     = useState('initial');      // generating pipeline
  const [error,     setError]     = useState('');

  /* ───────── add-scene modal ───────── */
const [showAddModal, setShowAddModal] = useState(false);
const [newIdx,        setNewIdx]      = useState(0);          // numeric position
const [newImgPrompt,  setNewImgPrompt]= useState('');
const [newScriptTxt,  setNewScriptTxt]= useState('');

  /* ───────── edit-ui state ───────── */
  const [editingIdx,  setEditingIdx]  = useState(null);       // caption being edited
  const [editingText, setEditingText] = useState('');
  const [imgModalIdx, setImgModalIdx] = useState(null);       // image modal index
  const [imgPrompt,   setImgPrompt]   = useState('');

  /*  “busy” trackers – indexes currently regenerating  */
  const [busyImgs,  setBusyImgs]  = useState(new Set());      // Set<number>
  const [busyAudio, setBusyAudio] = useState(new Set());      // Set<number>

  /* disable continue while *anything* is still busy */
  const isBusy = stage !== 'ready' || busyImgs.size > 0 || busyAudio.size > 0;

  const stylePrompt = state?.style?.prompt || '';



  /* ───────── initial pipeline ───────── */
  useEffect(() => {
    (async () => {
      try {
        /* 1️⃣ script */
        const sRes = await fetch('http://127.0.0.1:5000/api/generate-script', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({ prompt: state.prompt })
        });
        const sJson = await sRes.json();
        if (!sJson.script) throw new Error(sJson.error || 'Script generation failed');
        setScript(sJson.script);

        /* 2️⃣ start image job */
        const jobRes = await fetch('http://127.0.0.1:5000/api/generate-images', {
          method : 'POST',
          headers: { 'Content-Type':'application/json' },
          body   : JSON.stringify({ script: sJson.script, style_prompt: stylePrompt })
        });
        const { job_id } = await jobRes.json();
        if (!job_id) throw new Error('Image job did not return job_id');
        setStage('images');

        /* poll for images */
        const poll = async () => {
          const r  = await fetch(`http://127.0.0.1:5000/api/image-status/${job_id}`);
          const j  = await r.json();
          if (j.status === 'done') {
            clearTimeout(pollRef.current);
            setImages(j.images);
            setSentences(j.sentences);

            /* 3️⃣ generate audio for each sentence */
            setStage('audio');
            const auds = await Promise.all(
              j.sentences.map(async txt => {
                const rr = await fetch('http://127.0.0.1:5000/api/generate-audio', {
                  method : 'POST',
                  headers: { 'Content-Type':'application/json' },
                  body   : JSON.stringify({ text: txt })
                });
                const jj = await rr.json();
                return jj.audio_url ?? null;
              })
            );
            setAudioUrls(auds);
            setStage('ready');
          } else {
            pollRef.current = setTimeout(poll, 3000);
          }
        };
        poll();
      } catch (e) {
        console.error(e);
        setError(e.message);
        setStage('error');
      }
    })();

    return () => pollRef.current && clearTimeout(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────── helper ui snippets ───────── */

  const PhoneLoader = () => (
    <div style={{
      width:270,height:480,background:'#0a0a0a',borderRadius:16,
      display:'flex',alignItems:'center',justifyContent:'center'
    }}>
      <div className="spinner" />
    </div>
  );

// 🔄 REPLACE your existing insertSceneLocally with this one
const insertSceneLocally = async () => {
  /* 1. clamp & parse index */
  setShowAddModal(false);
  setNewIdx(0);  setNewImgPrompt('');  setNewScriptTxt('');
  const idx = Math.min(Math.max(Number(newIdx), 0), sentences.length);

  /* 2. slide-in placeholders so the UI updates immediately */
  setSentences(s => [...s.slice(0, idx), newScriptTxt, ...s.slice(idx)]);
  setImages   (i => [...i.slice(0, idx), 'placeholder',  ...i.slice(idx)]);
  setAudioUrls(a => [...a.slice(0, idx), null,           ...a.slice(idx)]);

  /* put spinners on the new slot */
  setBusyImgs (prev => new Set(prev).add(idx));
  setBusyAudio(prev => new Set(prev).add(idx));

  /* 3. fire BOTH backend calls in parallel */
  try {
    const [imgRes, audRes] = await Promise.all([
      fetch('http://127.0.0.1:5000/api/regenerate-image', {
        method :'POST',
        headers:{ 'Content-Type':'application/json' },
        body   : JSON.stringify({ text:newImgPrompt, style_prompt: stylePrompt })
      }).then(r=>r.json()),

      fetch('http://127.0.0.1:5000/api/generate-audio', {
        method :'POST',
        headers:{ 'Content-Type':'application/json' },
        body   : JSON.stringify({ text:newScriptTxt })
      }).then(r=>r.json())
    ]);

    /* 4. swap placeholders with real urls */
    setImages(prev => {
      const copy = [...prev];
      copy[idx]  = imgRes.image_url || copy[idx];   // keep placeholder on error
      return copy;
    });

    setAudioUrls(prev => {
      const copy = [...prev];
      copy[idx]  = audRes.audio_url || copy[idx];
      return copy;
    });
  } catch (err) {
    console.error('[add-scene] generation failed:', err);
    alert('Unable to generate the new scene. Please try again.');
  } finally {
    /* 5. clear busy flags whether it worked or not */
    setBusyImgs (s => { const c=new Set(s); c.delete(idx); return c; });
    setBusyAudio(s => { const c=new Set(s); c.delete(idx); return c; });
  }

  /* 6. reset & close modal */
  setShowAddModal(false);
  setNewIdx(0);
  setNewImgPrompt('');
  setNewScriptTxt('');
};


  const LoaderStrip = () => (
    <div style={{ display:'flex',gap:50,overflowX:'auto',padding:'0 12px',marginTop:40 }}>
      {Array.from({length:5}).map((_,i)=><PhoneLoader key={i}/>)}
    </div>
  );

  const overlaySpinner = (
    <div style={{
      position:'absolute',inset:0,display:'flex',
      alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,.55)',borderRadius:16
    }}>
      <div className="spinner" />
    </div>
  );

  /* ───────── edit caption handlers ───────── */

  const startEditSentence = (idx) => {
    if (busyAudio.has(idx)) return;
    setEditingIdx(idx);
    setEditingText(sentences[idx]);
  };

  const saveSentence = async () => {
    const idx = editingIdx;
    if (idx === null) return;

    /* optimistic text update */
    const newSentences = [...sentences];
    newSentences[idx] = editingText;
    setSentences(newSentences);

    /* mark busy & regenerate audio */
    setBusyAudio(prev => new Set(prev).add(idx));
    setEditingIdx(null);

    try {
      const r = await fetch('http://127.0.0.1:5000/api/regenerate-audio', {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({ text: editingText })
      });
      const j = await r.json();
      if (!j.audio_url) throw new Error(j.error || 'audio failed');

      const newAud = [...audioUrls];
      newAud[idx] = j.audio_url;
      setAudioUrls(newAud);
    } catch (err) {
      console.error(err);
      alert('Failed to regenerate audio, please try again.');
    } finally {
      setBusyAudio(prev => {
        const s = new Set(prev);
        s.delete(idx);
        return s;
      });
    }
  };

  const removeScene = (idx) => {
    // drop idx from every parallel array
    setSentences(s => s.filter((_, i) => i !== idx));
    setImages   (s => s.filter((_, i) => i !== idx));
    setAudioUrls(s => s.filter((_, i) => i !== idx));
  
    // rebuild busy-sets to account for shifted indexes
    setBusyImgs (old => {
      const fresh = new Set();
      [...old].forEach(i => { if (i !== idx) fresh.add(i > idx ? i - 1 : i); });
      return fresh;
    });
    setBusyAudio(old => {
      const fresh = new Set();
      [...old].forEach(i => { if (i !== idx) fresh.add(i > idx ? i - 1 : i); });
      return fresh;
    });
  };

  /* ───────── image modal handlers ───────── */

  const openImgModal  = (idx) => { if (!busyImgs.has(idx)) { setImgModalIdx(idx); setImgPrompt(''); } };

  const saveImgPrompt = async () => {
    const idx = imgModalIdx;
    if (idx === null || !imgPrompt.trim()) return;

    setImgModalIdx(null);
    setBusyImgs(prev => new Set(prev).add(idx));

    try {
      const r = await fetch('http://127.0.0.1:5000/api/regenerate-image', {
        method :'POST',
        headers:{ 'Content-Type':'application/json' },
        body   : JSON.stringify({ text: imgPrompt, style_prompt: stylePrompt })
      });
      const j = await r.json();
      if (!j.image_url) throw new Error(j.error || 'image failed');

      const newImgs = [...images];
      newImgs[idx] = j.image_url;
      setImages(newImgs);
    } catch (err) {
      console.error(err);
      alert('Failed to regenerate image, please try again.');
    } finally {
      setBusyImgs(prev => {
        const s = new Set(prev);
        s.delete(idx);
        return s;
      });
    }
  };

  /* ───────── layout helpers ───────── */
  const storyboardCss = {
    display:'flex',
    gap:50,
    justifyContent:'center',
    overflowX:'auto',
    padding:'0 12px',
    marginTop:40
  };

  const shouldScroll = (count) => count > 4;

  /* ───────── render ───────── */
  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={()=>navigate('/')}>Faceless.AI</div>
      </header>

      <main className="main-content">
        <h1>{stage==='ready' ? 'Edit your scenes' : 'Generating your scenes…'}</h1>
        <p>{stage==='ready' ? 'Customize each frame of your video'
                             : 'This should only take a moment…'}</p>

<button
      className="chat-btn"
      style={{ marginTop: 50, marginLeft: 16 }}
      onClick={() => setShowAddModal(true)}
    >
      ＋ Add New Scene
    </button>
    

        {error && <p style={{color:'tomato'}}>{error}</p>}
        {stage!=='ready' && <LoaderStrip />}

        {stage === 'ready' && (
            <div
              /* 👇 only this object changed */
              style={{
                display        : 'flex',
                gap            : 50,
                padding        : '0 12px',
                marginTop      : 40,
                overflowX      : 'auto',        // enable scrolling
                overflowY      : 'hidden',
                scrollbarWidth : 'thin',        // Firefox – optional
                justifyContent : shouldScroll(sentences.length) ? 'flex-start' : 'center',
                /* keeps the row the exact width of its content
                  so “flex-start” really hugs the left edge                */
                width          : 'max-content',
                /* let the browser shrink the row to the viewport when it’s short */
                maxWidth       : '100%'
              }}
            >
            {sentences.map((txt,i)=>(
              <div key={i} style={{ width:270,flexShrink:0,textAlign:'center',position:'relative' }}>
                {/* image + overlay spinner */}
                <div style={{ position:'relative' }}>
  {(images[i] === 'placeholder' || busyImgs.has(i)) ? (
    /* black phone frame with spinner */
    <div style={{
      width:'100%', height:480, background:'#0a0a0a',
      borderRadius:16, display:'flex', alignItems:'center',
      justifyContent:'center'
    }}>
      <div className="spinner" />
    </div>
  ) : (
    <>
      <img
        src={images[i]}
        alt=""
        style={{ width:'100%', borderRadius:16 }}
      />
    </>
  )}
</div>

                {/* image edit button */}
                <button
                  className="chat-btn"
                  style={{ marginTop:8 }}
                  disabled={busyImgs.has(i)}
                  onClick={()=>openImgModal(i)}
                >
                  Edit Image ✍️
                </button>

                {/* caption / editor */}
                <div style={{ marginTop:18,position:'relative' }}>
                  {busyAudio.has(i) && overlaySpinner}
                  {editingIdx===i ? (
                    <>
                      <textarea
                        value={editingText}
                        onChange={e=>setEditingText(e.target.value)}
                        rows={3}
                        style={{ width:'100%',borderRadius:6,padding:6 }}
                      />
                      <div style={{ marginTop:6 }}>
                        <button className="send-btn" onClick={saveSentence}>Save</button>
                        <button
                          className="chat-btn"
                          style={{ marginLeft:10 }}
                          onClick={()=>setEditingIdx(null)}
                        >Cancel</button>
                      </div>
                    </>
                  ) : (


<>
<p style={{ margin:'12px 0' }}>{txt}</p>

{/* Edit text */}

<button
  className="chat-btn"
  style={{ padding:'4px 8px', fontSize:12, marginLeft:8 }}
  onClick={() => removeScene(i)}
>
  Delete Scene 🗑️
</button>

<button
  className="chat-btn"
  style={{ padding:'4px 8px', fontSize:12 }}
  disabled={busyAudio.has(i)}
  onClick={() => startEditSentence(i)}
>
  Edit Script 📝
</button>

{/* Delete scene */}

</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* continue */}
        {stage === 'ready' && (
  <>

    <button
      className="send-btn"
      style={{ marginTop: 50 }}
      disabled={isBusy}
      onClick={() =>
        navigate('/final', {
          state: { ...state, script, sentences, images, audioUrls }
        })
      }
    >
      🎬 Create Final Video
    </button>


  </>
)}
      </main>

      {/* modal for image prompt */}
      {imgModalIdx!==null && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,.6)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:9000
        }}>
          <div style={{
            width:320,background:'#1e1e1e',borderRadius:12,padding:24,
            boxShadow:'0 4px 18px rgba(0,0,0,.45)'
          }}>
            <h2 style={{marginTop:0}}>Generate different image</h2>
            <textarea
              placeholder="Describe a new scene…"
              value={imgPrompt}
              onChange={e=>setImgPrompt(e.target.value)}
              rows={3}
              style={{ width:'100%',borderRadius:6,padding:6 }}
            />
            <div style={{ marginTop:16,textAlign:'right' }}>
              <button className="chat-btn" onClick={()=>setImgModalIdx(null)}>Cancel</button>
              <button
                className="send-btn"
                style={{ marginLeft:12 }}
                disabled={!imgPrompt.trim()}
                onClick={saveImgPrompt}
              >Save</button>
            </div>
          </div>
        </div>
      )}

{showAddModal && (
  <div style={{
    position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:9000
  }}>
    <div style={{
      width:340, background:'#1e1e1e', borderRadius:12, padding:24,
      boxShadow:'0 4px 18px rgba(0,0,0,.45)'
    }}>
      <h2 style={{marginTop:0}}>Insert New Scene</h2>

      <label style={{fontSize:14,display:'block',margin:'12px 0 4px'}}>Position (0-{sentences.length})</label>
      <input
        type="number"
        value={newIdx}
        min={0}
        max={sentences.length}
        onChange={e=>setNewIdx(e.target.value)}
        style={{ width:'100%', borderRadius:6, padding:6, marginBottom:12 }}
      />

      <label style={{fontSize:14,display:'block',marginBottom:4}}>Image description</label>
      <textarea
        rows={2}
        value={newImgPrompt}
        onChange={e=>setNewImgPrompt(e.target.value)}
        style={{ width:'100%', borderRadius:6, padding:6, marginBottom:12 }}
      />

      <label style={{fontSize:14,display:'block',marginBottom:4}}>Narrator script</label>
      <textarea
        rows={2}
        value={newScriptTxt}
        onChange={e=>setNewScriptTxt(e.target.value)}
        style={{ width:'100%', borderRadius:6, padding:6 }}
      />

      <div style={{ marginTop:16, textAlign:'right' }}>
        <button className="chat-btn" onClick={()=>setShowAddModal(false)}>
          Cancel
        </button>
        <button
          className="send-btn"
          style={{ marginLeft:12 }}
          disabled={!newImgPrompt.trim() || !newScriptTxt.trim()}
          onClick={insertSceneLocally}
        >
          Generate
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

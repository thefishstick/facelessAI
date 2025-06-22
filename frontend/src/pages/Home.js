import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

const scriptTemplates = [
  "What if an AI developed true consciousness and asked for human rights?",
  "Is it possible that our reality is just an advanced computer simulation?",
  "What if archaeologists discovered a 50,000-year-old advanced city frozen in Antarctica?",
  "What if a secret deep-space program confirmed an alien message but the government is hiding it?",
  "Should the super-rich be allowed to upload their consciousness and live forever while others cannot?"
];

const placeholderPrompts = [
    "the lost city of Atlantis...",
    "what if dinosaurs never went extinct...",
    "the simulation theory...",
];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [placeholder, setPlaceholder] = useState('Create a video about...');
  const [promptIndex, setPromptIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const staticText = "Create a video about... ";
    
    if (isDeleting) {
      if (subIndex === 0) {
        setIsDeleting(false);
        setPromptIndex(prev => (prev + 1) % placeholderPrompts.length);
        return;
      }
    } else {
      if (subIndex === placeholderPrompts[promptIndex].length) {
        setTimeout(() => setIsDeleting(true), 1500); // Pause before deleting
        return;
      }
    }

    const timeout = setTimeout(() => {
      setSubIndex(prev => prev + (isDeleting ? -1 : 1));
    }, isDeleting ? 20 : 40);

    return () => clearTimeout(timeout);
  }, [subIndex, isDeleting, promptIndex]);

  useEffect(() => {
    const staticText = "Ask Faceless to create a video about ";
    const currentTypedText = placeholderPrompts[promptIndex].substring(0, subIndex);
    setPlaceholder(staticText + currentTypedText);
  }, [subIndex, promptIndex]);

  const handleCreateVideo = () => {
    if (!prompt.trim()) return;
    navigate('/style', { state: { prompt } });
  };

  const handleRollTheDice = () => {
    const randomIndex = Math.floor(Math.random() * scriptTemplates.length);
    setPrompt(scriptTemplates[randomIndex]);
  };

  const videoData = [
    { url: 'https://dcuyywmc95nls.cloudfront.net/EN/2compress.mp4', views: '932.9K' },
    { url: 'https://dcuyywmc95nls.cloudfront.net/EN/6compress.mp4', views: '12.2M' },
    { url: 'https://dcuyywmc95nls.cloudfront.net/EN/4compress.mp4', views: '1.2M' },
    { url: 'https://dcuyywmc95nls.cloudfront.net/EN/5compress.mp4', views: '1.5M' },
    { url: 'https://home-vexub.s3.eu-west-3.amazonaws.com/EN/3compress.mp4', views: '230K' },
    { url: 'https://dcuyywmc95nls.cloudfront.net/EN/1compress.mp4', views: '421K' }
  ];
  const duplicated = [...videoData, ...videoData];

  return (
    <div className="App homepage">
      <header className="App-header">
        <div className="logo">🎭 Faceless</div>
      </header>

      <main className="main-content">
        <h1>Share your story. Not your Face</h1>
        <p>Create faceless content by chatting with AI</p>

        <div className="chat-container">
          <div className="chat-input-wrapper">
            <textarea
              placeholder={placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="chat-controls">
              <button className="chat-btn" onClick={handleRollTheDice}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
                  <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle>
                  <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"></circle>
                  <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"></circle>
                </svg>
              </button>
              <button
                className="send-btn"
                onClick={handleCreateVideo}
                disabled={!prompt.trim()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      <section className="community-section">
        <div className="video-carousel">
          {duplicated.map((v, i) => (
            <div key={i} className="video-card">
              <video className="video-bg" src={v.url} muted autoPlay loop playsInline />
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

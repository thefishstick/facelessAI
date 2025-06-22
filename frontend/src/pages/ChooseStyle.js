import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

const styles = [
  { id: 'style1', name: 'Crisp Hyperreal Modern', imgSrc: 'https://images.unsplash.com/photo-1554333394-2742470e45c4?w=180&h=160&fit=crop' },
  { id: 'style2', name: 'Bold Color Pop Motion', imgSrc: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=180&h=160&fit=crop' },
  { id: 'style3', name: 'Dreamy Soft Glow Aesthetic', imgSrc: 'https://images.unsplash.com/photo-1563291074-2bf8677a6e51?w=180&h=160&fit=crop' },
  { id: 'style4', name: 'Kinetic Cutout Collage', imgSrc: 'https://images.unsplash.com/photo-1555212697-3663b4f6535e?w=180&h=160&fit=crop' },
  { id: 'style5', name: 'Monochrome Minimal Motion', imgSrc: 'https://images.unsplash.com/photo-1534529392-3645e5405523?w=180&h=160&fit=crop' },
  { id: 'style6', name: 'Punchy Comic Frame Motion', imgSrc: 'https://images.unsplash.com/photo-1614732414445-ac7083b86a6b?w=180&h=160&fit=crop' },
  { id: 'style7', name: 'Liquid Gradient Flow', imgSrc: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=180&h=160&fit=crop' },
  { id: 'style8', name: 'Flash Cut Zoom Edit', imgSrc: 'https://images.unsplash.com/photo-1534953931930-b1d4a9f691c2?w=180&h=160&fit=crop' },
  { id: 'style9', name: 'Analog Retro Glow', imgSrc: 'https://images.unsplash.com/photo-1519689393322-24318c4623a9?w=180&h=160&fit=crop' },
  { id: 'style10', name: 'Studio Light Portrait Motion', imgSrc: 'https://images.unsplash.com/photo-1588190349949-a1b73c4ebb64?w=180&h=160&fit=crop' }
];

export default function ChooseStyle() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [selectedStyle, setSelectedStyle] = useState(null);

  const handleContinue = () => {
    navigate('/narrator', { state: { ...state, style: selectedStyle } });
  };

  return (
    <div className="App dark-theme">
      <header className="App-header">
        <div className="logo clickable" onClick={() => navigate('/')}>
          🎭 Faceless
        </div>
      </header>
      <main className="main-content">
        <h1>Choose an Art Style</h1>
        <p>Select your favorite visual style for the video.</p>
        <div className="style-grid">
          {styles.map(style => (
            <div
              key={style.id}
              className={`style-card ${selectedStyle === style.id ? 'selected' : ''}`}
              onClick={() => setSelectedStyle(style.id)}
            >
              <img src={style.imgSrc} alt={style.name} />
              <span>{style.name}</span>
            </div>
          ))}
        </div>
        <div className="page-nav-buttons">
          <button className="chat-btn" onClick={() => navigate('/edit', { state })}>
            Back
          </button>
          <button className="send-btn" onClick={handleContinue} disabled={!selectedStyle}>
            Continue
          </button>
        </div>
      </main>
    </div>
  );
}

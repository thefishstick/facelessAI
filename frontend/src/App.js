
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import EditScript from './pages/EditScript';
import ChooseStyle from './pages/ChooseStyle';
import SelectNarrator from './pages/SelectNarrator';
import Editor from './pages/Editor';
import FinalOutput from './pages/FinalOutput';
import MyVideos    from './pages/MyVideos';
import Completed    from './pages/Completed';
import Steps    from './pages/Steps';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/edit"    element={<EditScript />} />
        <Route path="/style"   element={<ChooseStyle />} />
        <Route path="/narrator" element={<SelectNarrator />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/final"     element={<FinalOutput />} />
        <Route path="/my-videos" element={<MyVideos />} />
        <Route path="/completed" element={<Completed />} />
        <Route path="/steps" element={<Steps />} />
      </Routes>
    </Router>
  );
}

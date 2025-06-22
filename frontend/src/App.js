
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import EditScript from './pages/EditScript';
import ChooseStyle from './pages/ChooseStyle';
import SelectNarrator from './pages/SelectNarrator';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/edit"    element={<EditScript />} />
        <Route path="/style"   element={<ChooseStyle />} />
        <Route path="/narrator" element={<SelectNarrator />} />
      </Routes>
    </Router>
  );
}

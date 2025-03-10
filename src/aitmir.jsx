// src/aitmir.jsx - Entry point for Aitmir channel
import React from 'react';
import ReactDOM from 'react-dom/client';
import TagCloud from './components/tagcloud';
import './index.css';

document.title = 'AI Mirror Tag Cloud';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TagCloud channelId="aitmir" />
  </React.StrictMode>
);
// src/wowmind.jsx - Entry point for WowMind channel
import React from 'react';
import ReactDOM from 'react-dom/client';
import TagCloud from './components/tagcloud';
import './index.css';

document.title = 'WowMind Tag Cloud';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TagCloud channelId="wowmind" />
  </React.StrictMode>
);
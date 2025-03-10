// src/blogem.jsx - Entry point for BlogEm channel
import React from 'react';
import ReactDOM from 'react-dom/client';
import TagCloud from './components/tagcloud';
import './index.css';

document.title = 'BlogEm Tag Cloud';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TagCloud channelId="blogem" />
  </React.StrictMode>
);
// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import TagCloud from './components/tagcloud';
import './index.css';

// Get the channel ID from Vite's environment variables
const channelId = import.meta.env.VITE_CHANNEL_ID || 'wowmind';

// Set the document title based on the channel
const channelTitles = {
  wowmind: 'WowMind Tag Cloud',
  aitmir: 'AI IT Tag Cloud',
  blogem: 'Blogem Tag Cloud'
};

document.title = channelTitles[channelId] || 'Tag Cloud';

console.log('Running with channel:', channelId);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TagCloud channelId={channelId} />
  </React.StrictMode>
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Landing from './landing/Landing.jsx';
import './index.css';

// Two pages, no router needed: the dossier landing at "/" and the application at "/app"
// (Vercel rewrites every path to index.html).
const isApp = window.location.pathname.replace(/\/+$/, '') === '/app';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isApp ? <App /> : <Landing />}
  </React.StrictMode>,
);

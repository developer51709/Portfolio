import React from 'react';
import ReactDOM from 'react-dom/client';
import GitProfile from './components/gitprofile.tsx';

// NOTE: The old `isKnownPath` pathname gate here was the cause of the whole
// site rendering the 404 page in production: it stripped trailing slashes
// (turning the root path '/' into '') and then compared against the base,
// so — with base '/' — isKnownPath was false for every URL, including the
// homepage. The hash router (#/projects, #/commissions, ...) handles all
// navigation client-side, so every path should render the app.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GitProfile config={CONFIG} />
  </React.StrictMode>,
);

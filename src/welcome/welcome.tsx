import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WelcomeApp } from './WelcomeApp';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <WelcomeApp />
  </StrictMode>,
);

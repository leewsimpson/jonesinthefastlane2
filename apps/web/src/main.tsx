import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/i18n.ts';
import { App } from './ui/App.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MapProvider } from './context/MapContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MapProvider>
      <App />
    </MapProvider>
  </StrictMode>
);

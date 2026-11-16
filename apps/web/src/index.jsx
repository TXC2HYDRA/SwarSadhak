import React from 'react';
// Self-hosted variable fonts (OFL): Instrument Sans for Latin, Anek Devanagari for Marathi and Hindi.
// unicode-range splits mean a page only downloads the scripts it shows.
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/anek-devanagari';
import { createRoot } from 'react-dom/client';
import { AccountRoot } from './AccountRoot.jsx';

createRoot(document.getElementById('root')).render(<AccountRoot />);

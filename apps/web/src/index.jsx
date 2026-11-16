import React from 'react';
// Self-hosted variable fonts (OFL). unicode-range splits mean a page only downloads the scripts it shows.
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/noto-serif-devanagari';
import { createRoot } from 'react-dom/client';
import { AccountRoot } from './AccountRoot.jsx';

createRoot(document.getElementById('root')).render(<AccountRoot />);

import React from 'react';
// Self-hosted variable fonts (OFL). unicode-range splits mean a page only downloads the scripts it shows.
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource/tiro-devanagari-marathi/400.css';
import { createRoot } from 'react-dom/client';
import { AccountRoot } from './AccountRoot.jsx';
import './darbar.css'; // theme layer, last so it wins over styles.css and portal.css

createRoot(document.getElementById('root')).render(<AccountRoot />);

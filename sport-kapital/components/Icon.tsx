// components/Icon.tsx
// Sistema de iconos vectoriales — trazo 2px, estética financiera profesional.
import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

export type IconName =
  | 'home' | 'chart' | 'pie' | 'news' | 'wallet'
  | 'arrow-up-right' | 'arrow-down-right' | 'arrow-right' | 'arrow-down' | 'arrow-up'
  | 'chevron-left' | 'chevron-right' | 'chevron-down'
  | 'check' | 'check-circle' | 'close' | 'search' | 'swap'
  | 'alert' | 'shield' | 'info' | 'clock'
  | 'qr' | 'bank' | 'coin' | 'send' | 'receive'
  | 'trophy' | 'flame' | 'bolt' | 'star'
  | 'user' | 'settings' | 'book' | 'target' | 'layers' | 'candle'
  | 'calendar' | 'globe' | 'sound-on' | 'sound-off' | 'eye' | 'eye-off'
  | 'zoom-in' | 'zoom-out' | 'bell';

interface Props { name: IconName; size?: number; color?: string; strokeWidth?: number }

export function Icon({ name, size = 22, color = '#FFFFFF', strokeWidth = 1.5 }: Props) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  const s = { width: size, height: size, viewBox: '0 0 24 24' };

  switch (name) {
    case 'home': return <Svg {...s}><Path {...p} d="M3 10.5 12 3l9 7.5" /><Path {...p} d="M5 9.5V21h14V9.5" /><Path {...p} d="M10 21v-6h4v6" /></Svg>;
    case 'chart': return <Svg {...s}><Path {...p} d="M3 21h18" /><Path {...p} d="M6 17v-5" /><Path {...p} d="M11 17V7" /><Path {...p} d="M16 17v-3" /><Path {...p} d="M21 17V4" /></Svg>;
    case 'candle': return <Svg {...s}><Line {...p} x1="7" y1="3" x2="7" y2="7" /><Rect {...p} x="4.8" y="7" width="4.4" height="8" rx="1" /><Line {...p} x1="7" y1="15" x2="7" y2="20" /><Line {...p} x1="17" y1="5" x2="17" y2="9" /><Rect {...p} x="14.8" y="9" width="4.4" height="7" rx="1" /><Line {...p} x1="17" y1="16" x2="17" y2="21" /></Svg>;
    case 'pie': return <Svg {...s}><Path {...p} d="M21 12A9 9 0 1 1 12 3" /><Path {...p} d="M12 3a9 9 0 0 1 9 9h-9z" /></Svg>;
    case 'news': return <Svg {...s}><Rect {...p} x="3" y="4" width="18" height="16" rx="2" /><Path {...p} d="M7 9h6" /><Path {...p} d="M7 13h10" /><Path {...p} d="M7 16h10" /><Path {...p} d="M16 9h1" /></Svg>;
    case 'wallet': return <Svg {...s}><Path {...p} d="M20 7H5a2 2 0 0 1 0-4h13v4" /><Path {...p} d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" /><Circle {...p} cx="16.5" cy="13.5" r="1" fill={color} /></Svg>;
    case 'arrow-up-right': return <Svg {...s}><Path {...p} d="M7 17 17 7" /><Path {...p} d="M9 7h8v8" /></Svg>;
    case 'arrow-down-right': return <Svg {...s}><Path {...p} d="M7 7l10 10" /><Path {...p} d="M17 9v8H9" /></Svg>;
    case 'arrow-right': return <Svg {...s}><Path {...p} d="M4 12h16" /><Path {...p} d="M13 5l7 7-7 7" /></Svg>;
    case 'arrow-down': return <Svg {...s}><Path {...p} d="M12 4v16" /><Path {...p} d="M5 13l7 7 7-7" /></Svg>;
    case 'arrow-up': return <Svg {...s}><Path {...p} d="M12 20V4" /><Path {...p} d="M5 11l7-7 7 7" /></Svg>;
    case 'chevron-left': return <Svg {...s}><Path {...p} d="M15 5l-7 7 7 7" /></Svg>;
    case 'chevron-right': return <Svg {...s}><Path {...p} d="M9 5l7 7-7 7" /></Svg>;
    case 'chevron-down': return <Svg {...s}><Path {...p} d="M5 9l7 7 7-7" /></Svg>;
    case 'check': return <Svg {...s}><Path {...p} d="M4 12.5 9.5 18 20 6.5" /></Svg>;
    case 'check-circle': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="9" /><Path {...p} d="M8 12.5l2.8 2.8L16.5 9" /></Svg>;
    case 'close': return <Svg {...s}><Path {...p} d="M6 6l12 12" /><Path {...p} d="M18 6 6 18" /></Svg>;
    case 'search': return <Svg {...s}><Circle {...p} cx="11" cy="11" r="7" /><Path {...p} d="M20 20l-3.5-3.5" /></Svg>;
    case 'swap': return <Svg {...s}><Path {...p} d="M7 4v13" /><Path {...p} d="M3.5 7.5 7 4l3.5 3.5" /><Path {...p} d="M17 20V7" /><Path {...p} d="M13.5 16.5 17 20l3.5-3.5" /></Svg>;
    case 'alert': return <Svg {...s}><Path {...p} d="M12 3 2.5 20h19L12 3z" /><Line {...p} x1="12" y1="10" x2="12" y2="14.5" /><Circle cx="12" cy="17.3" r="1" fill={color} /></Svg>;
    case 'shield': return <Svg {...s}><Path {...p} d="M12 3l7.5 3v5.5c0 4.6-3.2 7.9-7.5 9.5-4.3-1.6-7.5-4.9-7.5-9.5V6L12 3z" /><Path {...p} d="M9 12l2.2 2.2L15.5 9.8" /></Svg>;
    case 'info': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="9" /><Line {...p} x1="12" y1="11" x2="12" y2="16.5" /><Circle cx="12" cy="7.8" r="1.1" fill={color} /></Svg>;
    case 'clock': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="9" /><Path {...p} d="M12 7v5l3.5 2" /></Svg>;
    case 'qr': return <Svg {...s}><Rect {...p} x="3.5" y="3.5" width="7" height="7" rx="1" /><Rect {...p} x="13.5" y="3.5" width="7" height="7" rx="1" /><Rect {...p} x="3.5" y="13.5" width="7" height="7" rx="1" /><Path {...p} d="M13.5 13.5h3v3h-3z" /><Path {...p} d="M20.5 13.5v3" /><Path {...p} d="M13.5 20.5h3" /><Circle cx="19.5" cy="19.5" r="1.2" fill={color} /></Svg>;
    case 'bank': return <Svg {...s}><Path {...p} d="M3 9.5 12 4l9 5.5" /><Path {...p} d="M5 10v8" /><Path {...p} d="M9.5 10v8" /><Path {...p} d="M14.5 10v8" /><Path {...p} d="M19 10v8" /><Path {...p} d="M3 20h18" /></Svg>;
    case 'coin': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="8.5" /><Path {...p} d="M12 7.5v9" /><Path {...p} d="M15 9.3c-.7-1-1.8-1.4-3-1.4-1.7 0-3 .8-3 2.1 0 2.8 6 1.4 6 4.1 0 1.3-1.3 2.1-3 2.1-1.2 0-2.3-.5-3-1.4" /></Svg>;
    case 'send': return <Svg {...s}><Path {...p} d="M12 19V5" /><Path {...p} d="M5 12l7-7 7 7" /></Svg>;
    case 'receive': return <Svg {...s}><Path {...p} d="M12 5v14" /><Path {...p} d="M19 12l-7 7-7-7" /></Svg>;
    case 'trophy': return <Svg {...s}><Path {...p} d="M8 4h8v6a4 4 0 0 1-8 0V4z" /><Path {...p} d="M8 5H4.5v1.5A3.5 3.5 0 0 0 8 10" /><Path {...p} d="M16 5h3.5v1.5A3.5 3.5 0 0 1 16 10" /><Path {...p} d="M12 14v4" /><Path {...p} d="M8.5 20h7" /></Svg>;
    case 'flame': return <Svg {...s}><Path {...p} d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1 -.5-2-.5-2s3 1.5 3 5a5.5 5.5 0 0 1-11 0c0-5 5.5-7 5.5-11z" /></Svg>;
    case 'bolt': return <Svg {...s}><Path {...p} d="M13 3 5 13.5h5L11 21l8-10.5h-5L13 3z" /></Svg>;
    case 'star': return <Svg {...s}><Path {...p} d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5z" /></Svg>;
    case 'user': return <Svg {...s}><Circle {...p} cx="12" cy="8" r="4" /><Path {...p} d="M4.5 20c1.4-3.2 4.2-5 7.5-5s6.1 1.8 7.5 5" /></Svg>;
    case 'settings': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="3" /><Path {...p} d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.38 2.54a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.54h3.4l.38-2.54a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4z" /></Svg>;
    case 'book': return <Svg {...s}><Path {...p} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z" /><Path {...p} d="M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" /><Path {...p} d="M9 8h7" /></Svg>;
    case 'target': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="9" /><Circle {...p} cx="12" cy="12" r="5" /><Circle cx="12" cy="12" r="1.5" fill={color} /></Svg>;
    case 'layers': return <Svg {...s}><Path {...p} d="M12 3 3 8l9 5 9-5-9-5z" /><Path {...p} d="M3 13l9 5 9-5" /><Path {...p} d="M3 17.5l9 5 9-5" /></Svg>;
    case 'calendar': return <Svg {...s}><Rect {...p} x="3.5" y="5" width="17" height="15" rx="2" /><Path {...p} d="M3.5 9.5h17" /><Path {...p} d="M8 3v4" /><Path {...p} d="M16 3v4" /><Circle cx="8" cy="13.5" r="1" fill={color} /><Circle cx="12" cy="13.5" r="1" fill={color} /><Circle cx="16" cy="13.5" r="1" fill={color} /></Svg>;
    case 'globe': return <Svg {...s}><Circle {...p} cx="12" cy="12" r="9" /><Path {...p} d="M3 12h18" /><Path {...p} d="M12 3c2.8 2.5 4.3 5.7 4.3 9s-1.5 6.5-4.3 9c-2.8-2.5-4.3-5.7-4.3-9S9.2 5.5 12 3z" /></Svg>;
    case 'sound-on': return <Svg {...s}><Path {...p} d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5z" /><Path {...p} d="M16 9c1 1 1.5 2 1.5 3s-.5 2-1.5 3" /><Path {...p} d="M18.3 6.5c1.8 1.6 2.7 3.5 2.7 5.5s-.9 3.9-2.7 5.5" /></Svg>;
    case 'sound-off': return <Svg {...s}><Path {...p} d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5z" /><Line {...p} x1="16.5" y1="9.5" x2="21" y2="14.5" /><Line {...p} x1="21" y1="9.5" x2="16.5" y2="14.5" /></Svg>;
    case 'eye': return <Svg {...s}><Path {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><Circle {...p} cx="12" cy="12" r="3" /></Svg>;
    case 'eye-off': return <Svg {...s}><Path {...p} d="M3 3l18 18" /><Path {...p} d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.7 15.7 0 0 1-3.2 4" /><Path {...p} d="M6.5 7.6C4 9.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.8" /><Path {...p} d="M9.9 10a3 3 0 0 0 4.1 4.1" /></Svg>;
    case 'zoom-in': return <Svg {...s}><Circle {...p} cx="10.5" cy="10.5" r="7" /><Line {...p} x1="16" y1="16" x2="20.5" y2="20.5" /><Line {...p} x1="7.5" y1="10.5" x2="13.5" y2="10.5" /><Line {...p} x1="10.5" y1="7.5" x2="10.5" y2="13.5" /></Svg>;
    case 'zoom-out': return <Svg {...s}><Circle {...p} cx="10.5" cy="10.5" r="7" /><Line {...p} x1="16" y1="16" x2="20.5" y2="20.5" /><Line {...p} x1="7.5" y1="10.5" x2="13.5" y2="10.5" /></Svg>;
    case 'bell': return <Svg {...s}><Path {...p} d="M6 10.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14.5 6 10.5z" /><Path {...p} d="M10 19a2.2 2.2 0 0 0 4 0" /></Svg>;
    default: return null;
  }
}

export function Icon({name,size=20}:{name:string;size?:number}){
 const paths:Record<string,React.ReactNode>={
  galaxy:<><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  settings:<><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
  sound:<><path d="M11 4 6 8H3v8h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  muted:<><path d="M11 4 6 8H3v8h3l5 4Z"/><path d="m16 9 6 6m0-6-6 6"/></>,
  hand:<><path d="M8 13V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z"/></>,
  arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
  close:<path d="m6 6 12 12M6 18 18 6"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
  minus:<path d="M5 12h14"/>,
  home:<><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
  expand:<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/></>,
  play:<path d="m8 4 12 8-12 8Z"/>,
  help:<><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .4-1 1-1 2m0 3h.01"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.galaxy}</svg>;
}

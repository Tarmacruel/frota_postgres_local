// A shared drawing language, with a distinct silhouette for each destination.
const glyphs = {
  home: <><path className="module-icon__accent" d="m3.5 10 8.5-7 8.5 7v10H4Z" /><path d="m3 10 9-7 9 7M5 9v11h14V9M9.5 20v-6h5v6" /></>,
  fleet: <><path className="module-icon__accent" d="m6.5 5.5-2 6h15l-2-6Z" /><path d="m4.5 11.5 2-6h11l2 6M4.5 11.5h15l1 2v5h-17v-5ZM5 18.5V21m14-2.5V21M7 14.5h2m6 0h2" /></>,
  loans: <><path className="module-icon__accent" d="M4 6h14v5H4ZM6 13h14v5H6Z" /><path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" /></>,
  keys: <><circle className="module-icon__accent" cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="5" /><path d="m11.5 11.5 9 9m-5-5 2-2m1 5 2-2M7 7h.01" /></>,
  driver: <><circle className="module-icon__accent" cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.3" /><path d="m4 9 5.8 2m4.4 0L20 9m-8 5.3v6" /></>,
  wrench: <><path className="module-icon__accent" d="m4 16 8-8 4 4-8 8H4Z" /><path d="M14 4a5 5 0 0 0-3 6l-7.3 7.3a2.1 2.1 0 0 0 3 3L14 13a5 5 0 0 0 6-6l-3 3-3-3 3-3a5 5 0 0 0-3 0ZM5.7 18.3h.01" /></>,
  incident: <><path className="module-icon__accent" d="m12 3 10 18H2Z" /><path d="m12 3 10 18H2ZM12 9v4m0 3.5h.01" /></>,
  ticket: <><path className="module-icon__accent" d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6Z" /><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6ZM12 7v2m0 3v1m0 3v1" /></>,
  fuel: <><rect className="module-icon__accent" x="4" y="3" width="10" height="17" rx="2" /><path d="M3 21h12M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M4 10h10m0 3h2a2 2 0 0 1 2 2v2a1.5 1.5 0 0 0 3 0V8l-3-3m1.5 1.5L18 9l3 2" /></>,
  orders: <><rect className="module-icon__accent" x="4" y="5" width="14" height="16" rx="2" /><path d="M10 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m6 0h2a2 2 0 0 1 2 2v2M8 3h6v4H8ZM8 11h4" /><circle cx="17" cy="17" r="5" /><path d="M17 14v3l2 1" /></>,
  registry: <><rect className="module-icon__accent" x="8" y="3" width="8" height="5" rx="1.5" /><path d="M12 8v5M5 13h14M5 13v3m14-3v3m-7-3v3" /><rect x="8" y="3" width="8" height="5" rx="1.5" /><rect x="2.5" y="16" width="5" height="5" rx="1" /><rect x="9.5" y="16" width="5" height="5" rx="1" /><rect x="16.5" y="16" width="5" height="5" rx="1" /></>,
  station: <><path className="module-icon__accent" d="m2 8 10-5 10 5v3H2Z" /><path d="m2 8 10-5 10 5v3H2ZM4 11v10m16-10v10M2 21h20M9 21v-7h6v7m-4-4h2" /></>,
  contract: <><path className="module-icon__accent" d="M5 3h10l4 4v14H5Z" /><path d="M19 11V7l-4-4H5v18h7M14 3v5h5M8 11h4m-4 4h2m4 6 1-4 5-5 3 3-5 5Z" /></>,
  chart: <><path className="module-icon__accent" d="M5 13h3v7H5Zm5-5h3v12h-3Zm5-5h3v17h-3Z" /><path d="M3 3v18h18M7 17v-4m5 4V9m5 8V5" /></>,
  transfer: <><path className="module-icon__accent" d="M3 15h18v6H3Z" /><path d="M3 15v6h18v-6M8 15V3M4.5 6.5 8 3l3.5 3.5M16 3v12m-3.5-3.5L16 15l3.5-3.5" /></>,
  access: <><circle className="module-icon__accent" cx="9" cy="7" r="4" /><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 11-5.7" /><path d="m18 12-4 1.5V17c0 2.4 1.7 4 4 5 2.3-1 4-2.6 4-5v-3.5Zm-1.5 4.5 1 1 2-2" /></>,
  audit: <><path className="module-icon__accent" d="M4 3h12v18H4Z" /><path d="M9 21H4V3h12v6M7 7h6m-6 4h3" /><circle cx="16" cy="16" r="5" /><path d="m20 20 2 2m-8.5-6 1.5 1.5 3-3" /></>,
  'create-order': <><path className="module-icon__accent" d="M5 3h13v18H5Z" /><path d="M10 21H5V3h13v7M8 7h7m-7 4h3" /><circle cx="17" cy="17" r="5" /><path d="M17 14.5v5m-2.5-2.5h5" /></>,
}

export default function ModuleIcon({ name, className = '' }) {
  const glyph = glyphs[name]
  if (!glyph) return null
  return <svg className={`app-icon module-icon ${className}`.trim()} data-module-icon={name}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyph}</svg>
}

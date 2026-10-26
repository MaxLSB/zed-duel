export const icons: Record<string, string> = {
  'ahri-passive': '<path d="M12 3C4 9 4 13 12 21c8-8 8-12 0-18Z"/><path d="M8 12h8m-4-4v8"/>',
  'ahri-q':
    '<circle cx="12" cy="12" r="5"/><path d="M3 9a9 9 0 0 1 16-3m2 9a9 9 0 0 1-16 3M19 2v4h-4M5 22v-4h4"/>',
  'ahri-w':
    '<path d="M12 3c-6 7-5 9 0 11 5-2 6-4 0-11ZM5 11c-5 6-4 8 0 10 4-2 5-4 0-10Zm14 0c-5 6-4 8 0 10 4-2 5-4 0-10Z"/>',
  'ahri-e': '<path d="M12 21 3 12C-2 5 7-1 12 6c5-7 14-1 9 6Z"/>',
  'ahri-r': '<path d="m3 5 6 7-6 7m6-14 6 7-6 7m6-14 6 7-6 7"/>',
  'singed-passive': '<path d="M3 7h11m-9 5h15M3 17h11m2-13 4 3-4 3m1 4 4 3-4 3"/>',
  'singed-q':
    '<path d="M8 18a4 4 0 1 1-3-7 5 5 0 0 1 9-5 4 4 0 1 1 5 7 4 4 0 0 1-4 6"/><circle cx="10" cy="11" r="1"/><path d="m9 16 5-2"/>',
  'singed-w':
    '<ellipse cx="12" cy="17" rx="9" ry="4"/><path d="m10 3 4 0-1 5 3 4-8 0 3-4zM5 16l3 1m8-1 3 1"/>',
  'singed-e': '<path d="M4 19V9a6 6 0 0 1 12 0v4m-4-4 4 4 4-4"/><circle cx="5" cy="18" r="2"/>',
  'singed-r':
    '<path d="M9 2h6m-5 0v7l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V2M8 14h8"/><path d="m11 16 2 2m1-7 1 1"/>',
  passive: '<path d="m8 5 4 5 4-5 3 9-7 6-7-6z"/><path d="m8 13 3 1m5-1-3 1"/>',
  q: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><circle cx="12" cy="12" r="2"/>',
  w: '<path d="m9 3 5 5-2 5 3 7H3l3-7-2-5z"/><path d="m16 3 4 5-2 5 3 7h-4"/>',
  e: '<path d="M20 5A10 10 0 0 0 4 17l-2 2 6 1-1-6-2 2A7 7 0 0 1 18 7"/><path d="m10 12 4-5-1 6 4-1-5 6z"/>',
  r: '<path d="m5 3 7 7 7-7-3 8 5 8-9-5-9 5 5-8z"/><circle cx="12" cy="11" r="2"/>',
  d: '<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  link: '<path d="m10 14 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.q}</svg>`;

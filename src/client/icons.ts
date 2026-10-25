export const icons: Record<string, string> = {
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

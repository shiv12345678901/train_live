export function getTransportMode(route: string): string {
  const r = route.toLowerCase();
  if (r.startsWith('m') && /^m\d/.test(r)) return 'metro';
  if (r.startsWith('l') && /^l\d/.test(r)) return 'light_rail';
  if (r.startsWith('f') && /^f\d/.test(r)) return 'ferry';
  if (/^\d+$/.test(r) || r.startsWith('bus')) return 'bus';
  return 'train';
}


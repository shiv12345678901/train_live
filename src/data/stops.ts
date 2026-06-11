/**
 * Pre-populated major Sydney train stations and transport stops.
 * Names match the TfNSW departure monitor API format (name_dm parameter).
 * These are verified working station identifiers for the Trip Planner / Departure Monitor APIs.
 */

export interface PresetStop {
  name: string;
  stopId?: string; // TfNSW global stop ID for departure monitor
  type: 'station' | 'wharf' | 'light_rail' | 'bus_stop' | 'metro';
  zone: string;
}

export const PRESET_STOPS: PresetStop[] = [
  // ─── City & Inner ────────────────────────────────────────────────────
  { name: 'Central Station', stopId: '200060', type: 'station', zone: 'City' },
  { name: 'Town Hall Station', stopId: '200070', type: 'station', zone: 'City' },
  { name: 'Wynyard Station', stopId: '200080', type: 'station', zone: 'City' },
  { name: 'Circular Quay Station', stopId: '200090', type: 'station', zone: 'City' },
  { name: 'Martin Place Station', stopId: '200100', type: 'station', zone: 'City' },
  { name: 'St James Station', stopId: '200110', type: 'station', zone: 'City' },
  { name: 'Museum Station', stopId: '200120', type: 'station', zone: 'City' },
  { name: 'Kings Cross Station', stopId: '200130', type: 'station', zone: 'City' },
  { name: 'Edgecliff Station', stopId: '200140', type: 'station', zone: 'City' },
  { name: 'Bondi Junction Station', stopId: '200150', type: 'station', zone: 'City' },
  { name: 'Redfern Station', stopId: '200050', type: 'station', zone: 'City' },

  // ─── T4 Eastern Suburbs & Illawarra ──────────────────────────────────
  { name: 'Sydenham Station', stopId: '221110', type: 'station', zone: 'South' },
  { name: 'Tempe Station', stopId: '221310', type: 'station', zone: 'South' },
  { name: 'Wolli Creek Station', stopId: '221410', type: 'station', zone: 'South' },
  { name: 'Arncliffe Station', stopId: '221510', type: 'station', zone: 'South' },
  { name: 'Banksia Station', stopId: '221530', type: 'station', zone: 'South' },
  { name: 'Rockdale Station', stopId: '221620', type: 'station', zone: 'South' },
  { name: 'Kogarah Station', stopId: '221710', type: 'station', zone: 'South' },
  { name: 'Carlton Station', stopId: '221810', type: 'station', zone: 'South' },
  { name: 'Allawah Station', stopId: '221910', type: 'station', zone: 'South' },
  { name: 'Hurstville Station', stopId: '222010', type: 'station', zone: 'South' },
  { name: 'Penshurst Station', stopId: '222110', type: 'station', zone: 'South' },
  { name: 'Mortdale Station', stopId: '222210', type: 'station', zone: 'South' },
  { name: 'Oatley Station', stopId: '222310', type: 'station', zone: 'South' },
  { name: 'Como Station', stopId: '222410', type: 'station', zone: 'South' },
  { name: 'Jannali Station', stopId: '222510', type: 'station', zone: 'South' },
  { name: 'Sutherland Station', stopId: '222810', type: 'station', zone: 'South' },
  { name: 'Cronulla Station', stopId: '223310', type: 'station', zone: 'South' },

  // ─── T8 Airport & South ──────────────────────────────────────────────
  { name: 'Domestic Airport Station', stopId: '228310', type: 'station', zone: 'Airport' },
  { name: 'International Airport Station', stopId: '228410', type: 'station', zone: 'Airport' },
  { name: 'Mascot Station', stopId: '228210', type: 'station', zone: 'Airport' },
  { name: 'Green Square Station', stopId: '228110', type: 'station', zone: 'Airport' },

  // ─── T1 North Shore & Western ────────────────────────────────────────
  { name: 'Milsons Point Station', stopId: '207510', type: 'station', zone: 'North Shore' },
  { name: 'North Sydney Station', stopId: '207610', type: 'station', zone: 'North Shore' },
  { name: 'Waverton Station', stopId: '207710', type: 'station', zone: 'North Shore' },
  { name: 'Wollstonecraft Station', stopId: '207810', type: 'station', zone: 'North Shore' },
  { name: 'St Leonards Station', stopId: '207910', type: 'station', zone: 'North Shore' },
  { name: 'Artarmon Station', stopId: '208010', type: 'station', zone: 'North Shore' },
  { name: 'Chatswood Station', stopId: '208110', type: 'station', zone: 'North Shore' },
  { name: 'Roseville Station', stopId: '208210', type: 'station', zone: 'North Shore' },
  { name: 'Lindfield Station', stopId: '208310', type: 'station', zone: 'North Shore' },
  { name: 'Killara Station', stopId: '208410', type: 'station', zone: 'North Shore' },
  { name: 'Gordon Station', stopId: '208510', type: 'station', zone: 'North Shore' },
  { name: 'Pymble Station', stopId: '208610', type: 'station', zone: 'North Shore' },
  { name: 'Turramurra Station', stopId: '208710', type: 'station', zone: 'North Shore' },
  { name: 'Wahroonga Station', stopId: '208810', type: 'station', zone: 'North Shore' },
  { name: 'Hornsby Station', stopId: '209010', type: 'station', zone: 'North Shore' },

  // ─── T1 Western / T2 Inner West ─────────────────────────────────────
  { name: 'Strathfield Station', stopId: '215010', type: 'station', zone: 'West' },
  { name: 'Burwood Station', stopId: '214510', type: 'station', zone: 'West' },
  { name: 'Ashfield Station', stopId: '214110', type: 'station', zone: 'West' },
  { name: 'Lidcombe Station', stopId: '215410', type: 'station', zone: 'West' },
  { name: 'Auburn Station', stopId: '215510', type: 'station', zone: 'West' },
  { name: 'Granville Station', stopId: '215810', type: 'station', zone: 'West' },
  { name: 'Parramatta Station', stopId: '216010', type: 'station', zone: 'West' },
  { name: 'Westmead Station', stopId: '216110', type: 'station', zone: 'West' },
  { name: 'Blacktown Station', stopId: '217110', type: 'station', zone: 'West' },
  { name: 'Penrith Station', stopId: '218410', type: 'station', zone: 'West' },
  { name: 'Epping Station', stopId: '210510', type: 'station', zone: 'West' },
  { name: 'Macquarie Park Station', stopId: '210310', type: 'station', zone: 'West' },
  { name: 'Macquarie University Station', stopId: '210210', type: 'station', zone: 'West' },

  // ─── T3 Bankstown ────────────────────────────────────────────────────
  { name: 'Bankstown Station', stopId: '224910', type: 'station', zone: 'South West' },
  { name: 'Canterbury Station', stopId: '224210', type: 'station', zone: 'South West' },
  { name: 'Campsie Station', stopId: '224310', type: 'station', zone: 'South West' },
  { name: 'Belmore Station', stopId: '224410', type: 'station', zone: 'South West' },
  { name: 'Lakemba Station', stopId: '224510', type: 'station', zone: 'South West' },
  { name: 'Punchbowl Station', stopId: '224610', type: 'station', zone: 'South West' },

  // ─── T5 Cumberland ───────────────────────────────────────────────────
  { name: 'Merrylands Station', stopId: '216310', type: 'station', zone: 'West' },
  { name: 'Guildford Station', stopId: '216410', type: 'station', zone: 'West' },
  { name: 'Fairfield Station', stopId: '225810', type: 'station', zone: 'South West' },
  { name: 'Liverpool Station', stopId: '226110', type: 'station', zone: 'South West' },
  { name: 'Campbelltown Station', stopId: '226910', type: 'station', zone: 'South West' },

  // ─── T7 Olympic Park ─────────────────────────────────────────────────
  { name: 'Olympic Park Station', stopId: '215210', type: 'station', zone: 'West' },

  // ─── Inner West key stops ────────────────────────────────────────────
  { name: 'Newtown Station', stopId: '213310', type: 'station', zone: 'Inner West' },
  { name: 'Petersham Station', stopId: '213510', type: 'station', zone: 'Inner West' },
  { name: 'Lewisham Station', stopId: '213610', type: 'station', zone: 'Inner West' },
  { name: 'Summer Hill Station', stopId: '213710', type: 'station', zone: 'Inner West' },
  { name: 'Stanmore Station', stopId: '213410', type: 'station', zone: 'Inner West' },
  { name: 'Marrickville Station', stopId: '223810', type: 'station', zone: 'Inner West' },
  { name: 'Dulwich Hill Station', stopId: '223910', type: 'station', zone: 'Inner West' },

  // ─── Metro (if needed) ───────────────────────────────────────────────
  { name: 'Tallawong Station', stopId: '277110', type: 'metro', zone: 'Metro North West' },
  { name: 'Rouse Hill Station', stopId: '277210', type: 'metro', zone: 'Metro North West' },
  { name: 'Castle Hill Station', stopId: '277510', type: 'metro', zone: 'Metro North West' },
  { name: 'Norwest Station', stopId: '277410', type: 'metro', zone: 'Metro North West' },
  { name: 'Bella Vista Station', stopId: '277310', type: 'metro', zone: 'Metro North West' },
  { name: 'Cherrybrook Station', stopId: '277610', type: 'metro', zone: 'Metro North West' },

  // ─── Ferries (major wharves) ─────────────────────────────────────────
  { name: 'Circular Quay Wharf', type: 'wharf', zone: 'Ferry' },
  { name: 'Manly Wharf', type: 'wharf', zone: 'Ferry' },
  { name: 'Barangaroo Wharf', type: 'wharf', zone: 'Ferry' },
  { name: 'Taronga Zoo Wharf', type: 'wharf', zone: 'Ferry' },

  // ─── Light Rail ──────────────────────────────────────────────────────
  { name: 'Circular Quay Light Rail', type: 'light_rail', zone: 'Light Rail' },
  { name: 'Chinatown Light Rail', type: 'light_rail', zone: 'Light Rail' },
  { name: 'Dulwich Hill Light Rail', type: 'light_rail', zone: 'Light Rail' },
  { name: 'Randwick Light Rail', type: 'light_rail', zone: 'Light Rail' },
];

/**
 * Search the preset stops by name (fuzzy, case-insensitive).
 */
export function searchPresetStops(query: string): PresetStop[] {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim().toLowerCase();
  return PRESET_STOPS.filter(
    (stop) =>
      stop.name.toLowerCase().includes(q) ||
      stop.zone.toLowerCase().includes(q)
  );
}

/**
 * Get stops grouped by zone for browsing.
 */
export function getStopsByZone(): Record<string, PresetStop[]> {
  const zones: Record<string, PresetStop[]> = {};
  for (const stop of PRESET_STOPS) {
    if (!zones[stop.zone]) zones[stop.zone] = [];
    zones[stop.zone].push(stop);
  }
  return zones;
}

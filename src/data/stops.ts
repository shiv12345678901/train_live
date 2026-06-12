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
  { name: 'Central Station', type: 'station', zone: 'City' },
  { name: 'Town Hall Station', type: 'station', zone: 'City' },
  { name: 'Wynyard Station', type: 'station', zone: 'City' },
  { name: 'Circular Quay Station', type: 'station', zone: 'City' },
  { name: 'Martin Place Station', type: 'station', zone: 'City' },
  { name: 'St James Station', type: 'station', zone: 'City' },
  { name: 'Museum Station', type: 'station', zone: 'City' },
  { name: 'Kings Cross Station', type: 'station', zone: 'City' },
  { name: 'Edgecliff Station', type: 'station', zone: 'City' },
  { name: 'Bondi Junction Station', type: 'station', zone: 'City' },
  { name: 'Redfern Station', type: 'station', zone: 'City' },

  // ─── T4 Eastern Suburbs & Illawarra ──────────────────────────────────
  { name: 'Sydenham Station', type: 'station', zone: 'South' },
  { name: 'Tempe Station', type: 'station', zone: 'South' },
  { name: 'Wolli Creek Station', type: 'station', zone: 'South' },
  { name: 'Arncliffe Station', type: 'station', zone: 'South' },
  { name: 'Banksia Station', type: 'station', zone: 'South' },
  { name: 'Rockdale Station', type: 'station', zone: 'South' },
  { name: 'Kogarah Station', type: 'station', zone: 'South' },
  { name: 'Carlton Station', type: 'station', zone: 'South' },
  { name: 'Allawah Station', type: 'station', zone: 'South' },
  { name: 'Hurstville Station', type: 'station', zone: 'South' },
  { name: 'Penshurst Station', type: 'station', zone: 'South' },
  { name: 'Mortdale Station', type: 'station', zone: 'South' },
  { name: 'Oatley Station', type: 'station', zone: 'South' },
  { name: 'Como Station', type: 'station', zone: 'South' },
  { name: 'Jannali Station', type: 'station', zone: 'South' },
  { name: 'Sutherland Station', type: 'station', zone: 'South' },
  { name: 'Cronulla Station', type: 'station', zone: 'South' },

  // ─── T8 Airport & South ──────────────────────────────────────────────
  { name: 'Domestic Airport Station', type: 'station', zone: 'Airport' },
  { name: 'International Airport Station', type: 'station', zone: 'Airport' },
  { name: 'Mascot Station', type: 'station', zone: 'Airport' },
  { name: 'Green Square Station', type: 'station', zone: 'Airport' },

  // ─── T1 North Shore & Western ────────────────────────────────────────
  { name: 'Milsons Point Station', type: 'station', zone: 'North Shore' },
  { name: 'North Sydney Station', type: 'station', zone: 'North Shore' },
  { name: 'Waverton Station', type: 'station', zone: 'North Shore' },
  { name: 'Wollstonecraft Station', type: 'station', zone: 'North Shore' },
  { name: 'St Leonards Station', type: 'station', zone: 'North Shore' },
  { name: 'Artarmon Station', type: 'station', zone: 'North Shore' },
  { name: 'Chatswood Station', type: 'station', zone: 'North Shore' },
  { name: 'Roseville Station', type: 'station', zone: 'North Shore' },
  { name: 'Lindfield Station', type: 'station', zone: 'North Shore' },
  { name: 'Killara Station', type: 'station', zone: 'North Shore' },
  { name: 'Gordon Station', type: 'station', zone: 'North Shore' },
  { name: 'Pymble Station', type: 'station', zone: 'North Shore' },
  { name: 'Turramurra Station', type: 'station', zone: 'North Shore' },
  { name: 'Wahroonga Station', type: 'station', zone: 'North Shore' },
  { name: 'Hornsby Station', type: 'station', zone: 'North Shore' },

  // ─── T1 Western / T2 Inner West ─────────────────────────────────────
  { name: 'Strathfield Station', type: 'station', zone: 'West' },
  { name: 'Burwood Station', type: 'station', zone: 'West' },
  { name: 'Ashfield Station', type: 'station', zone: 'West' },
  { name: 'Lidcombe Station', type: 'station', zone: 'West' },
  { name: 'Auburn Station', type: 'station', zone: 'West' },
  { name: 'Granville Station', type: 'station', zone: 'West' },
  { name: 'Parramatta Station', type: 'station', zone: 'West' },
  { name: 'Westmead Station', type: 'station', zone: 'West' },
  { name: 'Blacktown Station', type: 'station', zone: 'West' },
  { name: 'Penrith Station', type: 'station', zone: 'West' },
  { name: 'Epping Station', type: 'station', zone: 'West' },
  { name: 'Macquarie Park Station', type: 'station', zone: 'West' },
  { name: 'Macquarie University Station', type: 'station', zone: 'West' },

  // ─── T3 Bankstown ────────────────────────────────────────────────────
  { name: 'Bankstown Station', type: 'station', zone: 'South West' },
  { name: 'Canterbury Station', type: 'station', zone: 'South West' },
  { name: 'Campsie Station', type: 'station', zone: 'South West' },
  { name: 'Belmore Station', type: 'station', zone: 'South West' },
  { name: 'Lakemba Station', type: 'station', zone: 'South West' },
  { name: 'Punchbowl Station', type: 'station', zone: 'South West' },

  // ─── T5 Cumberland ───────────────────────────────────────────────────
  { name: 'Merrylands Station', type: 'station', zone: 'West' },
  { name: 'Guildford Station', type: 'station', zone: 'West' },
  { name: 'Fairfield Station', type: 'station', zone: 'South West' },
  { name: 'Liverpool Station', type: 'station', zone: 'South West' },
  { name: 'Campbelltown Station', type: 'station', zone: 'South West' },

  // ─── T7 Olympic Park ─────────────────────────────────────────────────
  { name: 'Olympic Park Station', type: 'station', zone: 'West' },

  // ─── Inner West key stops ────────────────────────────────────────────
  { name: 'Newtown Station', type: 'station', zone: 'Inner West' },
  { name: 'Petersham Station', type: 'station', zone: 'Inner West' },
  { name: 'Lewisham Station', type: 'station', zone: 'Inner West' },
  { name: 'Summer Hill Station', type: 'station', zone: 'Inner West' },
  { name: 'Stanmore Station', type: 'station', zone: 'Inner West' },
  { name: 'Marrickville Station', type: 'station', zone: 'Inner West' },
  { name: 'Dulwich Hill Station', type: 'station', zone: 'Inner West' },

  // ─── Metro (if needed) ───────────────────────────────────────────────
  { name: 'Tallawong Station', type: 'metro', zone: 'Metro North West' },
  { name: 'Rouse Hill Station', type: 'metro', zone: 'Metro North West' },
  { name: 'Castle Hill Station', type: 'metro', zone: 'Metro North West' },
  { name: 'Norwest Station', type: 'metro', zone: 'Metro North West' },
  { name: 'Bella Vista Station', type: 'metro', zone: 'Metro North West' },
  { name: 'Cherrybrook Station', type: 'metro', zone: 'Metro North West' },

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

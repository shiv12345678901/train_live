export type TransportMode = 'all' | 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';

// Route Card (persisted)
export type RouteCard = {
  id: string;
  title: string;
  origin: string;
  originStopId?: string;
  destination: string;
  destinationStopId?: string;
  mode?: TransportMode;
  routeFilter: string[];
  order: number;
  enabled: boolean;
  pinned?: boolean;
  pinnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Alert Schedule (persisted)
export type AlertSchedule = {
  id: string;
  routeCardId: string;
  title: string;
  departureTime: string; // HH:mm format
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  oneTimeDate?: string; // ISO date for one-time alerts
  enabled: boolean;
  fixedReminderMinutes: number[]; // [25, 20, 10, 5]
  changeCheckMinutes: number[]; // legacy fixed checks
  selectedTripId?: string;
  selectedPlatform?: string;
  targetRoute?: string;
  targetDestination?: string;
  timezone?: string;
  delayRecheckMinutes?: number;
  fallbackWindowMinutes?: number;
  notifyOnCancellationImmediately?: boolean;
  createdAt: string;
  updatedAt: string;
};

// Occupancy level for a service
export type OccupancyLevel = 'empty' | 'low' | 'medium' | 'high' | 'full' | 'unknown';

// Leg of a journey (for multi-leg trips)
export type JourneyLeg = {
  mode: TransportMode;
  route: string;
  origin: string;
  destination: string;
  platform?: string;
  scheduledDeparture: string;
  estimatedDeparture?: string;
  scheduledArrival: string;
  estimatedArrival?: string;
  durationMinutes: number;
  stops: number;
  isWalking?: boolean;
};

// Train Departure (API response)
export type TrainDeparture = {
  tripId: string;
  route: string;
  destination?: string;
  platform: string;
  scheduledTime: string; // ISO datetime
  estimatedTime?: string; // ISO datetime
  status: 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';
  delayMinutes?: number;
  cancelled: boolean;
  transportType?: 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';
  occupancy?: OccupancyLevel;
  alerts: ServiceAlert[];
  legs?: JourneyLeg[]; // For multi-leg journeys
  fareEstimate?: FareEstimate;
};

// Fare estimate for a trip
export type FareEstimate = {
  adultPeak: number; // in dollars
  adultOffPeak: number;
  isPeakNow: boolean;
  currency: string;
};

// Service Alert
export type ServiceAlert = {
  id: string;
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  affectedLines?: string[];
};

// Alert Delivery State (persisted per schedule)
export type AlertDeliveryState = {
  alertScheduleId: string;
  sentKeys: string[];
  lastKnownTripState?: {
    estimatedTime?: string;
    platform?: string;
    status?: string;
    alertsHash?: string;
  };
};

// Alert Prefill Data (navigation state)
export type AlertPrefillData = {
  routeCardId: string;
  routeTitle: string;
  origin: string;
  destination: string;
  routeFilter: string[];
  departureTime: string;
  tripId?: string;
  platform?: string;
  targetRoute?: string;
  targetDestination?: string;
};

// App Settings
export type AppSettings = {
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramConnected: boolean;
  apiKey?: string;
  timezone: string;
  theme: 'light' | 'dark';
};

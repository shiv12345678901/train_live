// Route Card (persisted)
export type RouteCard = {
  id: string;
  title: string;
  origin: string;
  originStopId?: string;
  destination: string;
  destinationStopId?: string;
  routeFilter: string[];
  order: number;
  enabled: boolean;
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
  fixedReminderMinutes: number[]; // [20, 15, 10, 5]
  changeCheckMinutes: number[]; // [18, 13]
  selectedTripId?: string;
  selectedPlatform?: string;
  createdAt: string;
  updatedAt: string;
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
  alerts: ServiceAlert[];
};

// Service Alert
export type ServiceAlert = {
  id: string;
  title: string;
  description: string;
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

# Implementation Plan

## Overview

This design implements the Mobile Train Alert App as a mobile-first React web application with a serverless backend. The architecture separates frontend (React + state management), backend API (serverless functions), and scheduler (cron-triggered function) into distinct layers. Data persistence uses a lightweight store (e.g., Supabase, Firebase, or a simple JSON-based API) with idempotent alert delivery via Telegram Bot API.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Home    │  │   Schedule   │  │   Settings   │ │
│  │  Screen   │  │   Screen     │  │   Screen     │ │
│  └─────┬─────┘  └──────┬───────┘  └──────────────┘ │
│        │                │                            │
│  ┌─────▼─────┐         │                            │
│  │  Route    │         │                            │
│  │  Details  │         │                            │
│  └───────────┘         │                            │
│        │                │                            │
│  ┌─────▼────────────────▼───────────────────────┐   │
│  │           App State (Zustand/Context)          │   │
│  └───────────────────────┬───────────────────────┘   │
└──────────────────────────┼───────────────────────────┘
                           │
                     REST API Calls
                           │
┌──────────────────────────▼───────────────────────────┐
│                Backend (Serverless Functions)          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Route API  │  │ Schedule API │  │  Train API │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                 │          │
│  ┌──────▼─────────────────▼─────────────────▼──────┐  │
│  │            Cloud Firestore (Firebase)             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Alert Scheduler (1-min cron)              │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │ Process     │  │ Check    │  │  Telegram  │  │  │
│  │  │ Schedules   │  │ Changes  │  │  Sender    │  │  │
│  │  └─────────────┘  └──────────┘  └────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: React 18+ with TypeScript, Vite build tool
- **Styling**: CSS custom properties with design tokens, CSS modules or Tailwind
- **State Management**: Zustand for client-side state
- **Navigation**: React Router with bottom tab layout
- **Drag-and-Drop**: dnd-kit library for grid reordering
- **Backend**: Netlify Functions (or equivalent serverless)
- **Database**: Cloud Firestore (Firebase)
- **Scheduler**: Netlify Scheduled Functions (1-minute cron)
- **Notifications**: Telegram Bot API
- **Live Train Data**: Transport for NSW Open Data API (GTFS-realtime)

## Component Design

### Frontend Components

#### Layout Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `AppShell` | Root layout with bottom nav | children |
| `BottomNavigation` | 3-tab fixed nav bar | activeTab, onTabChange |
| `PageHeader` | Standard page header | title, backButton? |

#### Home Screen Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `HomeScreen` | Route card grid container | - |
| `RouteCardGrid` | Draggable grid layout | cards, onReorder |
| `RouteCard` | Single route card | routeCard, alertStatus |
| `AddNewCard` | Permanent add card | onTap |
| `RouteCreationSheet` | Route creation form | onSave, onCancel |

#### Route Details Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `RouteDetailsPage` | Live trains subpage | routeId |
| `TrainCard` | Single train display | train, onBellTap |
| `TrainStatusChip` | Status indicator | status |
| `LoadingSkeleton` | Placeholder while fetching | count |
| `InlineError` | Non-intrusive error display | message |

#### Schedule Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `ScheduleScreen` | Alert list + form | - |
| `AlertList` | Saved alerts display | alerts, onToggle, onDelete |
| `AlertForm` | Create/edit alert form | prefillData?, onSave |
| `AlertSummary` | Prefilled confirmation | alertData |

#### Settings Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `SettingsScreen` | Configuration page | - |
| `SettingRow` | Key-value config display | label, value, status |

### State Management

```typescript
// App Store (Zustand)
interface AppState {
  // Route Cards
  routeCards: RouteCard[];
  loadRouteCards: () => Promise<void>;
  saveRouteCard: (card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  reorderRouteCards: (cardIds: string[]) => Promise<void>;
  deleteRouteCard: (id: string) => Promise<void>;

  // Live Trains (per route, cached)
  liveTrains: Record<string, TrainDeparture[]>;
  liveTrainsLoading: Record<string, boolean>;
  liveTrainsError: Record<string, string | null>;
  fetchLiveTrains: (routeId: string) => Promise<void>;

  // Alert Schedules
  alertSchedules: AlertSchedule[];
  loadAlertSchedules: () => Promise<void>;
  saveAlertSchedule: (schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  toggleAlertSchedule: (id: string, enabled: boolean) => Promise<void>;
  deleteAlertSchedule: (id: string) => Promise<void>;

  // Navigation Context (bell icon → schedule prefill)
  pendingAlertPrefill: AlertPrefillData | null;
  setPendingAlertPrefill: (data: AlertPrefillData | null) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}
```

### Backend API Design

#### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/routes` | List all route cards |
| POST | `/api/routes` | Create route card |
| PUT | `/api/routes/:id` | Update route card |
| DELETE | `/api/routes/:id` | Delete route card |
| PUT | `/api/routes/order` | Save card ordering |
| GET | `/api/routes/:id/trains` | Fetch live trains for route |
| GET | `/api/schedules` | List all alert schedules |
| POST | `/api/schedules` | Create alert schedule |
| PUT | `/api/schedules/:id` | Update alert schedule |
| DELETE | `/api/schedules/:id` | Delete alert schedule |
| POST | `/api/schedules/:id/test` | Send test alert |

#### Live Train Fetching

The `/api/routes/:id/trains` endpoint:
1. Reads the route card's origin, destination, and filter
2. Calls Transport for NSW GTFS-realtime API
3. Filters to matching line and direction
4. Returns up to 5 upcoming departures sorted by time
5. Maps API response to the `TrainDeparture` type

### Alert Scheduler Design

The scheduler runs every minute and processes all enabled alert schedules:

```
For each enabled AlertSchedule:
  1. Calculate departure time for today (or oneTimeDate)
  2. Calculate minutes until departure
  3. If minutesUntilDeparture matches a fixed reminder offset (20, 15, 10, 5):
     a. Generate sent key: `{alertId}:{departureIso}:fixed-{offset}`
     b. If sent key exists in store → skip
     c. Fetch current train status from API
     d. Format fixed reminder message
     e. Send via Telegram Bot API
     f. Store sent key
  4. If minutesUntilDeparture matches a change check offset (18, 13):
     a. Fetch current train status from API
     b. Compare with lastKnownTripState
     c. If no meaningful change → skip
     d. Generate sent key: `{alertId}:{departureIso}:change-{offset}:{changeHash}`
     e. If sent key exists → skip
     f. Format change alert message
     g. Send via Telegram Bot API
     h. Store sent key
     i. Update lastKnownTripState
```

#### Timing Window Logic

Since cron may not fire at the exact second, use a ±1 minute window:

```typescript
function isWithinWindow(minutesUntilDeparture: number, targetMinutes: number): boolean {
  return minutesUntilDeparture >= targetMinutes - 0.5 
      && minutesUntilDeparture < targetMinutes + 0.5;
}
```

### Data Models

```typescript
// Route Card (persisted)
type RouteCard = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  routeFilter: string[];
  order: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// Alert Schedule (persisted)
type AlertSchedule = {
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
type TrainDeparture = {
  tripId: string;
  route: string;
  platform: string;
  scheduledTime: string; // ISO datetime
  estimatedTime?: string; // ISO datetime
  status: 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';
  delayMinutes?: number;
  cancelled: boolean;
  alerts: ServiceAlert[];
};

// Service Alert
type ServiceAlert = {
  id: string;
  title: string;
  description: string;
};

// Alert Delivery State (persisted per schedule)
type AlertDeliveryState = {
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
type AlertPrefillData = {
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
type AppSettings = {
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramConnected: boolean;
  apiKey?: string;
  timezone: string;
  theme: 'light' | 'dark';
};
```

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── BottomNavigation.tsx
│   │   └── PageHeader.tsx
│   ├── home/
│   │   ├── HomeScreen.tsx
│   │   ├── RouteCardGrid.tsx
│   │   ├── RouteCard.tsx
│   │   ├── AddNewCard.tsx
│   │   └── RouteCreationSheet.tsx
│   ├── route-details/
│   │   ├── RouteDetailsPage.tsx
│   │   ├── TrainCard.tsx
│   │   ├── TrainStatusChip.tsx
│   │   ├── LoadingSkeleton.tsx
│   │   └── InlineError.tsx
│   ├── schedule/
│   │   ├── ScheduleScreen.tsx
│   │   ├── AlertList.tsx
│   │   ├── AlertForm.tsx
│   │   └── AlertSummary.tsx
│   └── settings/
│       ├── SettingsScreen.tsx
│       └── SettingRow.tsx
├── store/
│   └── appStore.ts
├── api/
│   ├── routeApi.ts
│   ├── trainApi.ts
│   └── scheduleApi.ts
├── types/
│   └── index.ts
├── styles/
│   ├── tokens.css
│   └── global.css
├── utils/
│   ├── validation.ts
│   ├── timeUtils.ts
│   └── sentKeyUtils.ts
├── App.tsx
└── main.tsx

netlify/functions/
├── routes-list.ts
├── routes-create.ts
├── routes-update.ts
├── routes-delete.ts
├── routes-order.ts
├── routes-trains.ts
├── schedules-list.ts
├── schedules-create.ts
├── schedules-update.ts
├── schedules-delete.ts
├── schedules-test.ts
└── alert-scheduler.ts

lib/
├── firebase.ts          # Firebase Admin SDK initialization
├── firestore.ts         # Firestore collection helpers
└── telegram.ts          # Telegram Bot API client
```

## Correctness Properties

### Property 1: Add_New_Card Always Present (Invariant)

For any number of saved route cards (0 to maximum), the rendered Home_Screen grid always contains the Add_New_Card. After any add, delete, or reorder operation, the Add_New_Card remains present.

- **Relates to**: Requirement 1 (AC 1.3), Requirement 2 (AC 2.5)
- **Type**: Invariant
- **Test approach**: Property-based test generating random sequences of add/delete/reorder operations and asserting the Add_New_Card is always in the grid

### Property 2: Route Card Order Persistence (Round-Trip)

For any valid ordering of route cards, saving the order and then loading route cards returns the same order. reorder(cards) → save → load → verify order matches.

- **Relates to**: Requirement 2 (AC 2.3)
- **Type**: Round-trip
- **Test approach**: Property-based test generating random permutations, saving order via API, reloading, and verifying order equality

### Property 3: Route Validation Rejects Invalid Input (Error Condition)

For any route card input where title is empty, OR origin is empty, OR destination is empty, OR origin equals destination, the save operation must reject with a validation error.

- **Relates to**: Requirement 3 (AC 3.2, 3.4, 3.5)
- **Type**: Error condition
- **Test approach**: Property-based test generating invalid route inputs (empty fields, same origin/destination) and asserting all are rejected

### Property 4: Train Display Count Bounded (Metamorphic)

For any API response containing N trains, the Route_Details_Page displays min(N, 5) trains. The display count is always less than or equal to 5.

- **Relates to**: Requirement 4 (AC 4.3)
- **Type**: Metamorphic
- **Test approach**: Property-based test generating API responses with varying train counts and verifying display count

### Property 5: Estimated Time Display Priority (Invariant)

For any train where estimatedTime differs from scheduledTime, the displayed departure time equals estimatedTime. For any train where estimatedTime is null/undefined, the display shows "Live time unavailable".

- **Relates to**: Requirement 5 (AC 5.2, 5.4)
- **Type**: Invariant
- **Test approach**: Property-based test generating trains with/without estimated times and verifying display logic

### Property 6: Bell Icon Presence Invariant

For all trains in a departure list, the bell icon is present if and only if the train is not cancelled. Cancelled trains never show a bell icon.

- **Relates to**: Requirement 5 (AC 5.6), Requirement 6 (AC 6.1)
- **Type**: Invariant
- **Test approach**: Property-based test generating trains with random statuses and verifying bell visibility

### Property 7: Bell Tap Prefill Completeness (Round-Trip)

For any train selected via bell tap, the prefilled schedule form contains route title, origin, destination, route filter, and departure time matching the source train and route. No alert is persisted until explicit save.

- **Relates to**: Requirement 6 (AC 6.3, 6.4)
- **Type**: Round-trip
- **Test approach**: Property-based test generating random train/route combinations, simulating bell tap, and verifying all prefill fields match source data

### Property 8: Alert Status Reflects Schedule State (Invariant)

For any route card, its status text is "Alert set" if and only if there exists at least one enabled AlertSchedule with that route card's ID. Otherwise the status is "No alert".

- **Relates to**: Requirement 1 (AC 1.6, 1.7), Requirement 7 (AC 7.6)
- **Type**: Invariant
- **Test approach**: Property-based test generating routes with varying schedule states and verifying status text

### Property 9: Fixed Reminder Idempotency

For any alert schedule processed by the Scheduler, each fixed reminder (20, 15, 10, 5 min) is sent exactly once per departure instance. Running the scheduler multiple times in the same window produces no duplicate messages.

- **Relates to**: Requirement 8 (AC 8.5, 8.6), Requirement 15 (AC 15.2, 15.4)
- **Type**: Idempotence
- **Test approach**: Property-based test running scheduler processing twice for same alert/departure and verifying message count equals first run count

### Property 10: Change Check Conditional Send

For any change check interval, a message is sent if and only if the current trip state differs from the last known trip state. If states are equal, no message is sent. If states differ, exactly one message is sent per unique change.

- **Relates to**: Requirement 9 (AC 9.3, 9.4, 9.6)
- **Type**: Conditional invariant
- **Test approach**: Property-based test generating pairs of trip states (same/different) and verifying send/no-send behavior

### Property 11: No Delay Message Without Evidence

For any train where estimated time is less than or equal to scheduled time AND status is not "delayed", the Telegram_Bot does not send a delay notification. Delay messages require API evidence.

- **Relates to**: Requirement 10 (AC 10.4)
- **Type**: Invariant
- **Test approach**: Property-based test generating trains with various timing/status combinations and verifying no false delay messages

### Property 12: Route Card Grid Stability During Updates (Invariant)

For any live data update on the Home_Screen, the order and position of route cards remains unchanged. Card positions before update equal card positions after update.

- **Relates to**: Requirement 2 (AC 2.4)
- **Type**: Invariant
- **Test approach**: Property-based test simulating data refreshes and verifying card order/position stability

## Design Decisions

1. **Zustand over Redux**: Simpler API for a focused app with clear state boundaries. No need for middleware complexity.

2. **dnd-kit for drag-and-drop**: Purpose-built for React, supports grid layouts with both vertical and horizontal movement, accessible by default.

3. **Cloud Firestore for persistence**: Real-time document database with offline support, ideal for the route cards and schedules collection model. Documents map naturally to RouteCard and AlertSchedule types. Firestore's real-time listeners enable instant UI updates when data changes.

4. **Netlify Scheduled Functions**: Provides 1-minute cron granularity needed for alert timing windows. The ±0.5 minute matching window accounts for scheduling variance.

5. **Sent key pattern**: String-based idempotency keys stored as Firestore documents in an `alertDeliveryState` subcollection provide simple, reliable duplicate prevention that survives function retries.

6. **Navigation state for bell → schedule flow**: Using Zustand store for `pendingAlertPrefill` avoids URL parameter complexity and keeps the flow clean across tab switches.

7. **Separated route cards from schedules**: Different lifecycle and ownership. Routes exist without schedules. Schedules reference routes by ID. This matches the user's mental model.

8. **CSS custom properties for theming**: Enables future dark mode support while keeping the current white/black theme simple and performant.

## Firestore Collection Structure

```
users/{userId}/
├── routeCards/{routeCardId}         # RouteCard documents
├── alertSchedules/{scheduleId}      # AlertSchedule documents
├── alertDeliveryState/{scheduleId}  # Sent keys + last known state
└── settings/app                     # AppSettings document
```

Each route card and alert schedule is a document in the user's subcollection. The `alertDeliveryState` collection stores sent keys as an array field and the last known trip state for change detection. This structure supports Firestore security rules scoped per user and allows efficient queries for the scheduler.

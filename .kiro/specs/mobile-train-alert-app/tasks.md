# Implementation Plan

## Overview

Implementation tasks for the Mobile Train Alert App - a mobile-first React web application with serverless backend for Sydney train departure alerts via Telegram.

## Tasks

- [x] 1. Project Setup and Configuration
  - [x] 1.1 Initialize React project with Vite and TypeScript (`npm create vite@latest` with react-ts template)
  - [x] 1.2 Install core dependencies: `react-router-dom`, `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  - [x] 1.3 Install Firebase SDK: `firebase` (client) for frontend usage
  - [x] 1.4 Create `src/styles/tokens.css` with CSS custom properties (--bg, --text, --muted, --border, --panel, --success, --warning, --danger)
  - [x] 1.5 Create `src/styles/global.css` with base reset, Inter/system-ui font stack, and mobile-first viewport settings
  - [x] 1.6 Create `src/types/index.ts` with all TypeScript types: RouteCard, AlertSchedule, TrainDeparture, ServiceAlert, AlertDeliveryState, AlertPrefillData, AppSettings
  - [x] 1.7 Create `.env.example` with required environment variables: VITE_FIREBASE_CONFIG, VITE_API_BASE_URL
  - [x] 1.8 Configure Vite with path aliases (@/components, @/store, @/types, @/api, @/utils)

- [x] 2. Firebase and Firestore Setup
  - [x] 2.1 Create `src/lib/firebase.ts` with Firebase client SDK initialization using environment config
  - [x] 2.2 Create `src/lib/firestore.ts` with Firestore collection reference helpers for routeCards, alertSchedules, alertDeliveryState, and settings
  - [x] 2.3 Create `lib/firebase.ts` with Firebase Admin SDK initialization for serverless functions
  - [x] 2.4 Create `lib/firestore.ts` with server-side Firestore collection helpers and typed document converters
  - [x] 2.5 Define Firestore security rules (users can only read/write their own subcollections)

- [x] 3. State Management Store
  - [x] 3.1 Create `src/store/appStore.ts` with Zustand store implementing the AppState interface
  - [x] 3.2 Implement route cards slice: loadRouteCards, saveRouteCard, reorderRouteCards, deleteRouteCard
  - [x] 3.3 Implement live trains slice: liveTrains record, liveTrainsLoading, liveTrainsError, fetchLiveTrains
  - [x] 3.4 Implement alert schedules slice: loadAlertSchedules, saveAlertSchedule, toggleAlertSchedule, deleteAlertSchedule
  - [x] 3.5 Implement navigation context slice: pendingAlertPrefill, setPendingAlertPrefill
  - [x] 3.6 Implement settings slice: settings, updateSettings

- [x] 4. Layout and Navigation Components
  - [x] 4.1 Create `src/components/layout/AppShell.tsx` with React Router outlet and bottom nav container
  - [x] 4.2 Create `src/components/layout/BottomNavigation.tsx` with 3 tabs (Home, Schedule, Settings), fixed positioning, black active / grey inactive states
  - [x] 4.3 Create `src/components/layout/PageHeader.tsx` with title prop and optional back button
  - [x] 4.4 Set up React Router with routes: / (Home), /route/:id (Route Details), /schedule (Schedule), /settings (Settings)
  - [x] 4.5 Style BottomNavigation: fixed bottom, no gradients, no decorative effects, utilitarian design

- [x] 5. Home Screen and Route Card Grid
  - [x] 5.1 Create `src/components/home/HomeScreen.tsx` with app header and route card grid container
  - [x] 5.2 Create `src/components/home/RouteCard.tsx` displaying title, origin→destination, route filter, and status text
  - [x] 5.3 Create `src/components/home/AddNewCard.tsx` with plus icon and "Add New / Create route" label
  - [x] 5.4 Create `src/components/home/RouteCardGrid.tsx` with dnd-kit sortable grid (2 columns), long-press to activate drag
  - [x] 5.5 Implement drag-and-drop reorder logic: persist new order to Firestore via store action on drop
  - [x] 5.6 Style route cards: white background, black text, light grey border, sharp rounded corners, minimal shadow, stable aspect ratio
  - [x] 5.7 Implement status text logic: show "Alert set" if enabled schedule exists for route, otherwise "No alert"
  - [x] 5.8 Ensure Add_New_Card is always present in grid, cannot be deleted, but can be repositioned

- [x] 6. Route Creation Flow
  - [x] 6.1 Create `src/components/home/RouteCreationSheet.tsx` with form fields: title, origin, destination, route filter (optional)
  - [x] 6.2 Create `src/utils/validation.ts` with route validation: title required, origin required, destination required, origin ≠ destination
  - [x] 6.3 Implement form validation with inline error messages for each validation rule
  - [x] 6.4 Connect form save to Zustand store → Firestore (creates RouteCard document with auto-generated ID and next order value)
  - [x] 6.5 Handle full grid: new card appends and grid scrolls vertically
  - [x] 6.6 Add edit route support: long-press context menu or edit button to modify existing route card details

- [x] 7. Route Details Page with Live Trains
  - [x] 7.1 Create `src/components/route-details/RouteDetailsPage.tsx` with back button, route title, origin→destination, "Live" label
  - [x] 7.2 Create `src/components/route-details/LoadingSkeleton.tsx` with 5 skeleton train card placeholders
  - [x] 7.3 Create `src/components/route-details/InlineError.tsx` for non-intrusive error display
  - [x] 7.4 Implement live train fetching on page mount: call API, show skeletons during load, display up to 5 trains
  - [x] 7.5 Ensure fetch does not block entire app UI (component-level loading state only)
  - [x] 7.6 Handle API errors: show inline error on Route Details page only, no red toasts, no errors on Home screen

- [x] 8. Train Card Component
  - [x] 8.1 Create `src/components/route-details/TrainCard.tsx` with platform, departure time, route code, destination, status, bell icon
  - [x] 8.2 Create `src/components/route-details/TrainStatusChip.tsx` with status-based styling (grey=on-time, amber=delayed, red=cancelled, muted=unknown)
  - [x] 8.3 Implement departure time display logic: show estimatedTime when available, show "Live time unavailable" when missing
  - [x] 8.4 Show delay clearly when estimated > scheduled (amber chip with delay minutes)
  - [x] 8.5 Implement bell icon: visible on all non-cancelled trains, disabled/hidden on cancelled trains
  - [x] 8.6 Style train cards: black-and-white layout, platform/destination left, time right, status chips and bell bottom row

- [x] 9. Bell Icon to Schedule Prefill Flow
  - [x] 9.1 Implement bell tap handler: store selected train context in Zustand pendingAlertPrefill state
  - [x] 9.2 Navigate to Schedule tab after storing prefill data
  - [x] 9.3 On Schedule screen mount, detect pendingAlertPrefill and open alert form with prefilled data
  - [x] 9.4 Prefill all fields: route title, origin, destination, route filter, departure time, platform, trip ID
  - [x] 9.5 Display confirmation summary of prefilled alert details
  - [x] 9.6 Ensure no alert is saved until user explicitly taps "Save Alert"

- [x] 10. Schedule Screen and Alert Management
  - [x] 10.1 Create `src/components/schedule/ScheduleScreen.tsx` with alert list and create/edit form toggle
  - [x] 10.2 Create `src/components/schedule/AlertList.tsx` displaying saved alerts with enable/disable toggle and delete button
  - [x] 10.3 Create `src/components/schedule/AlertForm.tsx` with fields: route info, departure time, one-time/recurring toggle, days selector, alert cadence
  - [x] 10.4 Create `src/components/schedule/AlertSummary.tsx` showing prefilled data confirmation before save
  - [x] 10.5 Implement one-time vs recurring alert selection (one-time uses specific date, recurring uses day-of-week array)
  - [x] 10.6 Implement save alert: create AlertSchedule document in Firestore with fixedReminderMinutes [20,15,10,5] and changeCheckMinutes [18,13]
  - [x] 10.7 Implement enable/disable toggle: update AlertSchedule.enabled field in Firestore
  - [x] 10.8 Implement delete alert: remove AlertSchedule document and update associated route card status
  - [x] 10.9 Implement test alert button (visible when Telegram configured): sends test message via backend endpoint

- [x] 11. Settings Screen
  - [x] 11.1 Create `src/components/settings/SettingsScreen.tsx` with configuration sections
  - [x] 11.2 Create `src/components/settings/SettingRow.tsx` for key-value display with status indicator
  - [x] 11.3 Implement Telegram connection settings: bot token input, chat ID input, connection status display
  - [x] 11.4 Implement API key configuration status display
  - [x] 11.5 Display timezone setting (auto-detected, user-adjustable)
  - [x] 11.6 Display alert delivery status (last send time, error count)
  - [x] 11.7 Theme setting (light default, future dark mode placeholder)
  - [x] 11.8 App version/build metadata display

- [x] 12. Backend API - Route Endpoints
  - [x] 12.1 Create `netlify/functions/routes-list.ts`: GET handler, reads user's routeCards collection ordered by `order` field
  - [x] 12.2 Create `netlify/functions/routes-create.ts`: POST handler, validates input, creates RouteCard document
  - [x] 12.3 Create `netlify/functions/routes-update.ts`: PUT handler, updates RouteCard document fields
  - [x] 12.4 Create `netlify/functions/routes-delete.ts`: DELETE handler, removes RouteCard document
  - [x] 12.5 Create `netlify/functions/routes-order.ts`: PUT handler, accepts ordered array of card IDs and batch-updates `order` field

- [x] 13. Backend API - Live Train Endpoint
  - [x] 13.1 Create `netlify/functions/routes-trains.ts`: GET handler accepting route ID parameter
  - [x] 13.2 Read route card from Firestore to get origin, destination, and route filter
  - [x] 13.3 Call Transport for NSW GTFS-realtime API with route parameters
  - [x] 13.4 Parse and filter API response to matching line and direction
  - [x] 13.5 Map response to TrainDeparture type, sort by departure time, limit to 5 results
  - [x] 13.6 Handle API errors gracefully: return structured error response, not raw upstream errors

- [x] 14. Backend API - Schedule Endpoints
  - [x] 14.1 Create `netlify/functions/schedules-list.ts`: GET handler, reads user's alertSchedules collection
  - [x] 14.2 Create `netlify/functions/schedules-create.ts`: POST handler, validates and creates AlertSchedule document
  - [x] 14.3 Create `netlify/functions/schedules-update.ts`: PUT handler, updates AlertSchedule document
  - [x] 14.4 Create `netlify/functions/schedules-delete.ts`: DELETE handler, removes AlertSchedule and cleans up delivery state
  - [x] 14.5 Create `netlify/functions/schedules-test.ts`: POST handler, sends test Telegram message using saved bot config , schedules are in our app to send train status alert so while saving user can be able to select routes

- [x] 15. Alert Scheduler - Core Logic
  - [x] 15.1 Create `netlify/functions/alert-scheduler.ts` as Netlify Scheduled Function (1-minute cron)
  - [x] 15.2 Implement schedule scanning: query all enabled AlertSchedules across all users
  - [x] 15.3 Implement departure time calculation: determine today's (or one-time date's) full departure datetime in configured timezone
  - [x] 15.4 Implement timing window matching: check if current time falls within ±0.5 minutes of each reminder offset
  - [x] 15.5 Create `src/utils/timeUtils.ts` with time calculation helpers: minutesUntilDeparture, isWithinWindow, formatDepartureTime

- [x] 16. Alert Scheduler - Fixed Reminders
  - [x] 16.1 Implement fixed reminder processing: for offsets [20, 15, 10, 5], check timing window match
  - [x] 16.2 Generate sent key: `{alertId}:{departureIso}:fixed-{offset}`
  - [x] 16.3 Check Firestore alertDeliveryState for existing sent key before sending
  - [x] 16.4 Fetch current train status from Live Train API for the reminder message
  - [x] 16.5 Format fixed reminder Telegram message (route title, line, origin→destination, time, platform, offset, status)
  - [x] 16.6 Send message via Telegram Bot API
  - [x] 16.7 Store sent key in Firestore alertDeliveryState document after successful send

- [x] 17. Alert Scheduler - Change Checks
  - [x] 17.1 Implement change check processing: for offsets [18, 13], check timing window match
  - [x] 17.2 Fetch current train status from Live Train API
  - [x] 17.3 Compare current state with lastKnownTripState (estimatedTime, platform, status, alertsHash)
  - [x] 17.4 Determine if meaningful change occurred: delay, cancellation, platform change, route change, new service alert
  - [x] 17.5 If no change detected, skip sending (no message, no sent key)
  - [x] 17.6 If change detected: generate change-specific sent key with change hash
  - [x] 17.7 Format change alert Telegram message (route title, change description, platform, next reminder info)
  - [x] 17.8 Send message and store sent key
  - [x] 17.9 Update lastKnownTripState in Firestore

- [x] 18. Telegram Bot Integration
  - [x] 18.1 Create `lib/telegram.ts` with Telegram Bot API client (sendMessage function)
  - [x] 18.2 Implement message formatting functions: formatFixedReminder, formatChangeAlert, formatCancellation
  - [x] 18.3 Implement send with error handling and retry logic (max 2 retries)
  - [x] 18.4 Ensure no "delayed" message is sent without API evidence of delay (estimated > scheduled by meaningful threshold)
  - [x] 18.5 Implement cancellation message format: identifies route, departure time, suggests opening app

- [x] 19. Utility Functions
  - [x] 19.1 Create `src/utils/sentKeyUtils.ts`: generateFixedReminderKey, generateChangeCheckKey, hasBeenSent
  - [x] 19.2 Create `src/utils/timeUtils.ts`: parseTime, minutesUntilDeparture, isWithinWindow, formatRelativeTime, formatDepartureDisplay
  - [x] 19.3 Create `src/utils/validation.ts`: validateRouteCard (title, origin, destination checks), validateAlertSchedule
  - [x] 19.4 Create `src/api/routeApi.ts`: fetchRouteCards, createRouteCard, updateRouteCard, deleteRouteCard, updateRouteOrder
  - [x] 19.5 Create `src/api/trainApi.ts`: fetchLiveTrains
  - [x] 19.6 Create `src/api/scheduleApi.ts`: fetchSchedules, createSchedule, updateSchedule, deleteSchedule, testAlert

- [x] 20. Visual Polish and Mobile Optimization
  - [x] 20.1 Ensure 2-column grid fits standard mobile viewport (375px+) with proper spacing
  - [x] 20.2 Apply typography scale: app title 28-34px bold, card title 15-18px semibold, train time 24-30px bold, labels 11-13px
  - [x] 20.3 Verify all cards use white background, black text, light grey borders, minimal/no shadow
  - [x] 20.4 Verify bottom navigation is always visible and fixed, with no decorative effects
  - [x] 20.5 Test drag-and-drop on touch devices with long-press activation
  - [x] 20.6 Ensure grid stability during live data updates (no layout jumping)
  - [x] 20.7 Verify no gradients, neon colors, overlapping cards, or large decorative icons exist
  - [x] 20.8 Test responsive behavior on narrow devices (320px) — reduce spacing/font if needed but preserve grid

## Notes

- Tasks 1-3 form the foundation and must be completed first
- Frontend tasks (4-11) and backend tasks (12-18) can proceed in parallel after their dependencies are met
- Task 19 (Utility Functions) is needed early as other tasks reference these utilities
- Task 20 (Visual Polish) should be done last as it verifies the work of all UI tasks
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "4.1", "4.2", "4.3", "4.4", "4.5", "19.1", "19.2", "19.3", "19.4", "19.5", "19.6"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "12.1", "12.2", "12.3", "12.4", "12.5", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "14.1", "14.2", "14.3", "14.4", "14.5", "18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "15.1", "15.2", "15.3", "15.4", "15.5"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7", "17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "17.8", "17.9"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 6, "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6", "20.7", "20.8"] }
  ]
}
```

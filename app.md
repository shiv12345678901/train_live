# Mobile Train Alert App Specification

## Product Vision

Build a mobile-first Sydney train app that merges two jobs into one clean experience: fast live train viewing and reliable scheduled departure alerts. The app must feel as simple and sharp as a premium ride-hailing app: white background, black text, strong typography, clean cards, direct actions, and no dashboard clutter. The home screen is not an admin panel. It is a personal commute launcher.

The user opens the app and immediately sees their saved commute route cards. These are personal shortcuts such as `Morning Work`, `College`, `Home`, `Gym`, or `Weekend City`. Tapping a card fetches live train data for that route and shows the next five trains. From any train card, the user can tap a bell icon to schedule alerts for that exact route and train time. The schedule page should be prefilled from the selected live train, then the user confirms and saves.

The product must separate three mental models:

1. Home is for saved routes and live departures.
2. Schedule is for saved alert rules.
3. Settings is for account, API, Telegram, theme, and app configuration.

Do not mix route editing, live board data, and alert setup on one screen. Each screen should have a single purpose.

## Primary User Flow

The user opens the app on Home. By default, Home displays 8 route slots in a 3-column grid layout where possible. The cards are saved by the user. If the user has fewer than 8 saved routes, empty slots can show lightweight placeholders, but there must always be one permanent `Add New` card. The `Add New` card is always visible on the dashboard and is used to create a new route shortcut.

Each saved route card contains:

- Custom title, for example `Morning Work`
- Origin station
- Destination station
- Route filter, for example `T4`
- Small status text such as `Live route`, `Alert set`, or `No alert`
- Optional next train time if already cached

The user can long-press and drag cards to reorder them. Dragging must work vertically and horizontally. The order must persist after refresh and across sessions. The dashboard should use a stable grid and should not jump around while train times update.

When the user taps a route card, the app opens a route details page. This page fetches live train data from the API for that route and displays the upcoming 5 trains. The page must have a back button at the top. The train cards must be clear and action-oriented:

- Platform
- Departure time
- Route code
- Destination
- Status, such as on time, delayed, cancelled, changed, or unknown
- Service alert summary if available
- Bell icon button

When the user taps the bell icon on a train card, the app navigates to Schedule. The selected route and train details are prefilled:

- Route title
- Origin
- Destination
- Route filter
- Selected train departure time
- Platform if available
- Alert cadence
- Days, if recurring is enabled

The user reviews and taps `Save Alert`. After saving, the alert appears on the Schedule page and the original route card shows `Alert set`.

## Navigation Structure

Use a bottom navigation bar with exactly 3 tabs:

- Home
- Schedule
- Settings

The bottom nav must be fixed at the bottom of the mobile viewport. It should use black icons/text for the active state and muted grey for inactive states. Do not use bright gradients or decorative effects. The navigation should feel like Uber: direct, quiet, utilitarian.

### Home

Purpose: saved route shortcuts and live departure entry point.

Home must include:

- App title or small header
- 8 route cards visible by default where the device size allows
- Permanent `Add New` card
- Drag-and-drop card ordering
- Tap card to view live departures
- No schedule form on Home
- No raw API errors on Home

If live route loading fails, show a small inline message only on the route details page. Do not show repeated red toast popups.

### Route Details Subpage

Purpose: live trains for one saved route.

This is a subpage under Home, not a bottom-nav tab. It opens after tapping a route card. It must include:

- Back button
- Route title
- Origin to destination
- `Live` status label
- Upcoming 5 train cards
- Optional service alert panel
- Bell icon on each train

The bell icon must be the primary bridge between live trains and scheduled alerts. It must not immediately save an alert. It should open Schedule with the selected train details prefilled.

### Schedule

Purpose: create, edit, and manage alert rules.

Schedule must include:

- List of saved alert rules
- Create/edit alert form
- Autofill support from selected live train
- Delete alert
- Enable/disable alert
- Save button
- Test alert button if Telegram is configured

The Schedule page must not be the primary place to browse live train times. It can show the selected route and selected train time, but live train browsing belongs to the route details subpage.

### Settings

Purpose: app configuration.

Settings must include:

- Telegram connection status
- API key status
- Timezone display
- Alert delivery status
- Theme setting, defaulting to white/black
- Data reset/export options if needed
- App version/build metadata

Settings must not include route cards or train lists.

## Dashboard Card Layout

The dashboard must be mobile-first. The user specifically wants 2 columns and 3 rows on screen it means 6 cards. On very narrow devices, the app may reduce spacing and font size, but should preserve a compact grid as much as possible. \

Card layout:

- Aspect ratio should be stable.
- Cards should be rectangular with sharp-ish rounded corners, not pill-shaped.
- Use white card background.
- Use black primary text.
- Use light grey borders.
- Use minimal shadow or no shadow.
- Avoid color overload.

Recommended route card content:

```text
Morning Work
Rockdale -> Redfern
T4
Alert set
```

The `Add New` card should visually match the grid but use a plus icon and label:

```text
+
Add New
Create route
```

The `Add New` card must always remain available. It can be draggable like other cards, but the user should not be able to delete it. If the dashboard is full, tapping `Add New` creates another saved route and appends it to the grid, pushing the layout down as needed.

## Add/Edit Route Flow

When the user taps `Add New`, open a route creation screen or sheet. Required fields:

- Card title
- Origin station
- Destination station
- Route filter, optional but recommended

The title must be user-editable. Examples:

- Morning Work
- College
- Home
- Airport
- City Night

The route can be saved without any schedule. This is important. A route is first a live dashboard shortcut. A schedule is optional.

Validation:

- Title is required.
- Origin is required.
- Destination is required.
- Origin and destination cannot be the same.
- Schedule fields are not required when creating only a route card.

## Live Train Fetching

When a route card is tapped, call the live train endpoint for that route. Fetch upcoming 5 trains. Show loading skeletons while fetching. The app must not block the whole UI while loading one route.

Expected API response shape:

```json
{
  "route": {
    "id": "morning-work",
    "title": "Morning Work",
    "origin": "Rockdale Station",
    "destination": "Redfern Station",
    "routeFilter": ["T4"]
  },
  "trains": [
    {
      "tripId": "abc123",
      "route": "T4",
      "platform": "4",
      "scheduledTime": "2026-06-08T08:10:00+10:00",
      "estimatedTime": "2026-06-08T08:12:00+10:00",
      "status": "delayed",
      "delayMinutes": 2,
      "cancelled": false,
      "alerts": []
    }
  ]
}
```

The UI should prefer estimated time when available. If estimated time differs from scheduled time, show the delay clearly but calmly. Do not label a train delayed unless there is reliable evidence of delay. If data is missing, show `Live time unavailable`, not `N/A`.

## Train Cards

Train cards on the route details page should use a clean black-and-white layout with small status accents.

Card structure:

- Left: platform and route destination
- Right: departure time
- Bottom row: status chips and bell icon

Example:

```text
Platform 4                         8:12 am
T4 to Redfern

2 min late     Leaves in 9 min     [bell]
```

Status rules:

- On time: black text, light grey chip
- Delayed: amber/yellow small chip
- Cancelled: red chip and disabled bell
- Service changed: grey or amber chip
- Unknown: muted grey text

The bell button should be visible on every train card unless the train is cancelled. Tapping it opens Schedule with the train prefilled.

## Schedule Autofill Flow

When user taps bell on a train card:

1. Store selected train context in navigation state or a shared app store.
2. Navigate to Schedule tab.
3. Open the schedule form.
4. Prefill route and train time.
5. Show a confirmation summary.

Prefilled values:

- Route title
- Origin
- Destination
- Route filter
- Departure time
- Selected trip ID if available
- Platform if available
- Alert cadence defaults

The user can then choose:

- One-time alert for this train
- Recurring alert for selected days

For recurring alerts, the app should save the route and scheduled train time. It should not depend on the original trip ID forever, because trip IDs can change across days.

## Alert Timing Rules

When an alert is saved for a train departure time, send fixed reminder alerts at:

- 20 minutes before departure
- 15 minutes before departure
- 10 minutes before departure
- 5 minutes before departure

Additionally, check at:

- 18 minutes before departure
- 13 minutes before departure

The 18-minute and 13-minute checks should only send a message if there is an important change:

- Train is delayed
- Train is cancelled
- Platform changed
- Route changed
- Service alert appeared
- Estimated departure changed meaningfully

Do not send routine duplicate messages at 18 or 13 minutes if nothing changed.

This means the scheduler must support two kinds of send windows:

1. Fixed reminders: always send once at 20, 15, 10, and 5 minutes.
2. Change checks: inspect at 18 and 13 minutes, send only if changed.

Each send must be idempotent. Store a sent key per alert, per departure, per reminder type. Example keys:

```text
alertId:departureIso:fixed-20
alertId:departureIso:fixed-15
alertId:departureIso:change-18:delay-3-platform-4
```

This prevents duplicate spam when Netlify scheduled functions retry or run more than once.

## Telegram Message Design

Messages should be short and useful.

Fixed reminder example:

```text
Morning Work
T4 Rockdale -> Redfern
Departs 8:10 am from Platform 4
20 min reminder
Status: on time
```

Change alert example:

```text
Morning Work update
Your 8:10 am train is now 3 min late.
Platform 4
Next reminder still scheduled for 15 min before departure.
```

Cancelled example:

```text
Morning Work cancelled
The 8:10 am T4 to Redfern appears cancelled.
Open the app to choose another train.
```

Do not send messages saying delayed unless the API indicates delay or estimated time is later than scheduled by a meaningful threshold.

## Data Model

Use separate data models for route cards and alert schedules.

Route card:

```ts
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
```

Alert schedule:

```ts
type AlertSchedule = {
  id: string;
  routeCardId: string;
  title: string;
  departureTime: string;
  days: number[];
  oneTimeDate?: string;
  enabled: boolean;
  fixedReminderMinutes: number[];
  changeCheckMinutes: number[];
  selectedTripId?: string;
  selectedPlatform?: string;
  createdAt: string;
  updatedAt: string;
};
```

Alert state:

```ts
type AlertDeliveryState = {
  sentKeys: string[];
  lastKnownTripState?: {
    estimatedTime?: string;
    platform?: string;
    status?: string;
    alertsHash?: string;
  };
};
```

## Visual Design

Use a white and black theme inspired by Uber-style product design. Do not copy Uber branding, logos, or proprietary assets. If Uber Move is legally available in the project, use it. Otherwise use a licensed fallback such as `Inter`, `SF Pro`, or `system-ui`.

Design tokens:

```css
:root {
  --bg: #ffffff;
  --text: #000000;
  --muted: #545454;
  --border: #e8e8e8;
  --panel: #f6f6f6;
  --black: #000000;
  --white: #ffffff;
  --success: #0b7a3b;
  --warning: #a16207;
  --danger: #c1121f;
}
```

Typography:

- App title: 28-34px, bold
- Card title: 15-18px, semibold
- Train time: 24-30px, bold
- Labels: 11-13px, medium
- Body text: 14-16px

Layout style:

- White background
- Black primary buttons
- Light grey input fields
- Thin borders
- Minimal shadows
- Strong spacing
- Bottom nav always visible

Avoid:

- Gradients
- Neon colors
- Dark admin dashboard look
- Overlapping cards
- Huge decorative icons
- Repeated red toasts

## Technical Requirements

Frontend:

- Mobile-first React or React Native style architecture
- Bottom tab navigation
- Home route grid
- Route details subpage
- Schedule page
- Settings page
- Drag-and-drop card ordering
- Persistent local/store state
- API error boundaries

Backend:

- Endpoint to list route cards
- Endpoint to save route card order
- Endpoint to fetch live trains for route
- Endpoint to list schedules
- Endpoint to save schedule
- Scheduled function to process alerts
- Idempotent send-state store

The scheduler should run frequently enough to catch the required minute offsets. A 1-minute cron is ideal. If the platform only allows less frequent cron, widen the matching window but preserve idempotency.

## Success Criteria

The app is successful when:

- User can open Home and see saved route cards immediately.
- User can reorder route cards.
- User can add a custom route card.
- User can tap a route and see upcoming 5 trains.
- User can tap bell on a train and schedule an alert with prefilled data.
- Fixed alerts send at 20, 15, 10, and 5 minutes before departure.
- Change checks at 18 and 13 minutes only send if something changed.
- Duplicate messages are prevented.
- Home, Schedule, and Settings are clearly separated.
- UI stays clean, white, black, sharp, mobile-first, and readable.

The final app should feel like a personal commute control panel: open, tap route, pick train, set alert, leave on time.

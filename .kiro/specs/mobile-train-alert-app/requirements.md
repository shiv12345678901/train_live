# Requirements Document

## Introduction

A mobile-first Sydney train alert application that provides two core experiences: live train departure viewing from saved route shortcuts, and scheduled departure alerts delivered via Telegram. The app separates concerns into three screens (Home, Schedule, Settings) with a clean black-and-white visual design. Users create personal route cards, browse live departures, and schedule alerts with prefilled data from selected trains.

## Glossary

- **App**: The Mobile Train Alert application for Sydney trains
- **Home_Screen**: The primary tab displaying saved route cards in a grid layout
- **Route_Card**: A saved commute shortcut containing origin, destination, title, and route filter
- **Route_Details_Page**: A subpage under Home showing live train departures for a selected route
- **Train_Card**: A UI element on the Route Details Page displaying a single upcoming train departure
- **Schedule_Screen**: The tab for creating, editing, and managing alert rules
- **Settings_Screen**: The tab for app configuration including Telegram, API, and theme settings
- **Bottom_Navigation**: A fixed 3-tab navigation bar at the bottom of the viewport
- **Add_New_Card**: A permanent card in the route grid that opens the route creation flow
- **Alert_Schedule**: A saved rule defining when and how to send departure reminders
- **Fixed_Reminder**: An alert always sent at a predefined minute offset before departure (20, 15, 10, 5)
- **Change_Check**: An alert sent only when train status changes, checked at 18 and 13 minutes before departure
- **Sent_Key**: A unique idempotency key per alert, per departure, per reminder type preventing duplicate messages
- **Route_Filter**: A train line identifier such as T4 used to filter departures
- **Scheduler**: A backend scheduled function that processes alert rules and sends notifications
- **Telegram_Bot**: The messaging integration used to deliver alert notifications to the user
- **Live_Train_API**: The backend endpoint providing real-time train departure data

## Requirements

### Requirement 1: Home Screen Route Card Display

**User Story:** As a commuter, I want to see my saved route cards immediately when I open the app, so that I can quickly access live departures for my regular journeys.

#### Acceptance Criteria

1. WHEN the user opens the App, THE Home_Screen SHALL display all saved Route_Cards in a 2-column grid layout
2. THE Home_Screen SHALL display a maximum of 6 Route_Cards (2 columns by 3 rows) in the initial viewport on standard mobile devices
3. THE Home_Screen SHALL always display the Add_New_Card within the route grid
4. WHEN the user has fewer saved Route_Cards than the grid capacity, THE Home_Screen SHALL display lightweight placeholder slots for empty positions
5. THE Route_Card SHALL display the custom title, origin station, destination station, Route_Filter, and status text
6. WHILE a Route_Card has an associated enabled Alert_Schedule, THE Route_Card SHALL display the status text "Alert set"
7. WHILE a Route_Card has no associated Alert_Schedule, THE Route_Card SHALL display the status text "No alert"

### Requirement 2: Route Card Drag-and-Drop Reordering

**User Story:** As a commuter, I want to reorder my route cards by dragging them, so that I can prioritize the routes I use most frequently.

#### Acceptance Criteria

1. WHEN the user long-presses a Route_Card, THE Home_Screen SHALL activate drag-and-drop mode for that card
2. WHILE drag-and-drop mode is active, THE Home_Screen SHALL allow the user to move the Route_Card both vertically and horizontally within the grid
3. WHEN the user releases a Route_Card in a new position, THE Home_Screen SHALL persist the updated order across sessions
4. WHILE train time data updates on the Home_Screen, THE Home_Screen SHALL maintain stable card positions without layout shifting
5. THE Home_Screen SHALL prevent the user from deleting the Add_New_Card
6. THE Add_New_Card SHALL be draggable to a different grid position like other Route_Cards

### Requirement 3: Route Card Creation

**User Story:** As a commuter, I want to create a new route card with custom details, so that I can add my regular journeys as dashboard shortcuts.

#### Acceptance Criteria

1. WHEN the user taps the Add_New_Card, THE App SHALL open a route creation screen
2. THE App SHALL require the user to provide a title, origin station, and destination station to save a Route_Card
3. THE App SHALL accept an optional Route_Filter field during route creation
4. IF the user submits a route where origin and destination are the same station, THEN THE App SHALL display a validation error and prevent saving
5. IF the user submits a route without a title, THEN THE App SHALL display a validation error and prevent saving
6. WHEN a Route_Card is saved without an Alert_Schedule, THE App SHALL save the Route_Card as a live dashboard shortcut only
7. WHEN the dashboard grid is full, THE App SHALL append the new Route_Card to the grid and extend the layout vertically

### Requirement 4: Route Details Live Train Display

**User Story:** As a commuter, I want to see the next 5 live train departures for a saved route, so that I can decide which train to catch.

#### Acceptance Criteria

1. WHEN the user taps a Route_Card on the Home_Screen, THE App SHALL navigate to the Route_Details_Page for that route
2. THE Route_Details_Page SHALL display a back button, route title, origin-to-destination label, and a "Live" status label
3. WHEN the Route_Details_Page opens, THE App SHALL fetch live train data from the Live_Train_API and display up to 5 upcoming Train_Cards
4. WHILE the Live_Train_API request is in progress, THE Route_Details_Page SHALL display loading skeleton placeholders
5. THE Route_Details_Page SHALL not block the entire App UI while loading train data for one route
6. IF the Live_Train_API request fails, THEN THE Route_Details_Page SHALL display a small inline error message on that page only
7. THE App SHALL not display raw API errors or repeated red toast notifications on the Home_Screen

### Requirement 5: Train Card Information Display

**User Story:** As a commuter, I want to see clear departure details for each upcoming train, so that I can make informed decisions about which train to take.

#### Acceptance Criteria

1. THE Train_Card SHALL display the platform number, departure time, Route_Filter code, destination, and status
2. WHEN the Live_Train_API provides an estimated time that differs from the scheduled time, THE Train_Card SHALL display the estimated time as the primary departure time
3. WHEN the Live_Train_API provides an estimated time that is later than scheduled time, THE Train_Card SHALL display the delay clearly using an amber status chip
4. IF the Live_Train_API does not provide estimated time data, THEN THE Train_Card SHALL display "Live time unavailable" instead of "N/A"
5. WHEN a train has status "on time", THE Train_Card SHALL display a light grey status chip with black text
6. WHEN a train has status "cancelled", THE Train_Card SHALL display a red status chip and disable the bell icon button
7. WHEN service alerts are available for a train, THE Train_Card SHALL display a service alert summary

### Requirement 6: Bell Icon Alert Scheduling Bridge

**User Story:** As a commuter, I want to tap a bell icon on a train card to schedule an alert for that specific train, so that I get reminders before my chosen departure.

#### Acceptance Criteria

1. THE Train_Card SHALL display a bell icon button on every train that is not cancelled
2. WHEN the user taps the bell icon on a Train_Card, THE App SHALL navigate to the Schedule_Screen with the schedule form open
3. WHEN the user taps the bell icon, THE App SHALL prefill the schedule form with route title, origin, destination, Route_Filter, departure time, platform, and trip ID from the selected train
4. THE App SHALL not save an Alert_Schedule immediately when the bell icon is tapped
5. WHEN the Schedule_Screen opens via the bell icon, THE Schedule_Screen SHALL display a confirmation summary of the prefilled alert details

### Requirement 7: Alert Schedule Creation and Management

**User Story:** As a commuter, I want to create, edit, enable, disable, and delete alert schedules, so that I can control which departure reminders I receive.

#### Acceptance Criteria

1. WHEN the user taps "Save Alert" on the schedule form, THE App SHALL save the Alert_Schedule and display the alert in the schedule list
2. THE Schedule_Screen SHALL allow the user to choose between a one-time alert and a recurring alert with selected days
3. WHEN a recurring Alert_Schedule is created, THE App SHALL save the route and scheduled departure time without depending on the original trip ID
4. THE Schedule_Screen SHALL allow the user to enable or disable a saved Alert_Schedule
5. THE Schedule_Screen SHALL allow the user to delete a saved Alert_Schedule
6. WHEN an Alert_Schedule is saved, THE Route_Card associated with that schedule SHALL update its status text to "Alert set"
7. WHERE Telegram is configured in Settings_Screen, THE Schedule_Screen SHALL display a "Test Alert" button

### Requirement 8: Fixed Reminder Alert Delivery

**User Story:** As a commuter, I want to receive fixed reminders at 20, 15, 10, and 5 minutes before my train departs, so that I leave on time.

#### Acceptance Criteria

1. WHEN an Alert_Schedule is enabled and the departure time approaches, THE Scheduler SHALL send a Fixed_Reminder via Telegram_Bot at 20 minutes before departure
2. THE Scheduler SHALL send a Fixed_Reminder via Telegram_Bot at 15 minutes before departure
3. THE Scheduler SHALL send a Fixed_Reminder via Telegram_Bot at 10 minutes before departure
4. THE Scheduler SHALL send a Fixed_Reminder via Telegram_Bot at 5 minutes before departure
5. THE Scheduler SHALL store a Sent_Key for each Fixed_Reminder sent per alert, per departure instance
6. IF a Sent_Key already exists for a specific Fixed_Reminder, THEN THE Scheduler SHALL not send a duplicate message

### Requirement 9: Change Check Alert Delivery

**User Story:** As a commuter, I want to be notified only when something important changes with my train, so that I receive timely updates without unnecessary spam.

#### Acceptance Criteria

1. WHEN an Alert_Schedule is enabled and the departure time approaches, THE Scheduler SHALL check the Live_Train_API at 18 minutes before departure
2. THE Scheduler SHALL check the Live_Train_API at 13 minutes before departure
3. IF the train status has changed to delayed, cancelled, platform changed, route changed, or a service alert appeared since the last check, THEN THE Scheduler SHALL send a Change_Check alert via Telegram_Bot
4. IF no meaningful change has occurred since the last check, THEN THE Scheduler SHALL not send a message at the Change_Check interval
5. THE Scheduler SHALL store a Sent_Key for each Change_Check that includes the change details
6. IF a Sent_Key already exists for that specific change at that interval, THEN THE Scheduler SHALL not send a duplicate change alert

### Requirement 10: Telegram Message Formatting

**User Story:** As a commuter, I want my Telegram alerts to be short and informative, so that I can quickly understand my train status at a glance.

#### Acceptance Criteria

1. THE Telegram_Bot SHALL format Fixed_Reminder messages with route title, line code, origin-to-destination, departure time, platform, reminder offset, and current status
2. THE Telegram_Bot SHALL format Change_Check messages with route title, a description of the change, platform, and next reminder timing
3. WHEN a train is cancelled, THE Telegram_Bot SHALL send a cancellation message identifying the route, departure time, and suggesting the user open the App
4. THE Telegram_Bot SHALL not send a "delayed" message unless the Live_Train_API indicates a delay or the estimated time exceeds scheduled time by a meaningful threshold

### Requirement 11: Bottom Navigation Structure

**User Story:** As a commuter, I want a simple 3-tab navigation bar, so that I can quickly switch between my routes, schedules, and settings.

#### Acceptance Criteria

1. THE App SHALL display a Bottom_Navigation bar with exactly 3 tabs: Home, Schedule, and Settings
2. THE Bottom_Navigation SHALL remain fixed at the bottom of the mobile viewport across all screens
3. WHEN a tab is active, THE Bottom_Navigation SHALL display the tab icon and text in black
4. WHEN a tab is inactive, THE Bottom_Navigation SHALL display the tab icon and text in muted grey
5. THE Bottom_Navigation SHALL not use gradients or decorative visual effects
6. THE Route_Details_Page SHALL be a subpage under the Home tab, not a separate bottom navigation tab

### Requirement 12: Visual Design System

**User Story:** As a commuter, I want a clean, high-contrast black-and-white interface, so that the app is easy to read and feels modern.

#### Acceptance Criteria

1. THE App SHALL use a white background (#ffffff) with black primary text (#000000) as the default theme
2. THE App SHALL use muted grey (#545454) for secondary text and inactive elements
3. THE App SHALL use light grey borders (#e8e8e8) on cards and input fields
4. THE Route_Card SHALL use a white background, black title text, sharp rounded corners, and minimal or no shadow
5. THE App SHALL use the "Inter" font family or system-ui as the primary typeface
6. THE App SHALL not use gradients, neon colors, overlapping cards, or large decorative icons

### Requirement 13: Settings Screen Configuration

**User Story:** As a commuter, I want to manage my Telegram connection, API settings, and app preferences in one place, so that I can configure the app to my needs.

#### Acceptance Criteria

1. THE Settings_Screen SHALL display Telegram connection status
2. THE Settings_Screen SHALL display API key configuration status
3. THE Settings_Screen SHALL display the configured timezone
4. THE Settings_Screen SHALL display alert delivery status
5. THE Settings_Screen SHALL provide a theme setting that defaults to white and black
6. THE Settings_Screen SHALL not display Route_Cards or train departure lists

### Requirement 14: Backend API Endpoints

**User Story:** As a commuter, I want reliable backend endpoints, so that the app can persist my routes, fetch live trains, and manage schedules.

#### Acceptance Criteria

1. THE App SHALL provide an API endpoint to list all saved Route_Cards for the user
2. THE App SHALL provide an API endpoint to save Route_Card ordering changes
3. THE App SHALL provide an API endpoint to fetch live train departures for a specified route
4. THE App SHALL provide an API endpoint to list all saved Alert_Schedules for the user
5. THE App SHALL provide an API endpoint to create and update an Alert_Schedule
6. THE Scheduler SHALL run at a minimum frequency of once per minute to process Alert_Schedules within the required timing windows

### Requirement 15: Scheduler Idempotency and Reliability

**User Story:** As a commuter, I want the alert scheduler to be reliable and never send duplicate messages, so that I trust the notifications I receive.

#### Acceptance Criteria

1. THE Scheduler SHALL store a Sent_Key for every message successfully delivered via Telegram_Bot
2. IF the Scheduler processes an Alert_Schedule and a Sent_Key already exists for that reminder instance, THEN THE Scheduler SHALL skip sending that message
3. THE Scheduler SHALL store the last known trip state including estimated time, platform, status, and alerts hash for each active Alert_Schedule
4. IF the Scheduler function is retried or executed more than once within the same minute, THEN THE Scheduler SHALL produce identical results without duplicate messages

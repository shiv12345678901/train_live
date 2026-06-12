# Specific Train Watch Schedule Plan

This note records the agreed schedule-alert behaviour for future implementation.

## User decisions

- Cancellation handling: use **Option B**. When the selected train is cancelled, send a Telegram alert that the train is cancelled, then automatically switch to the next available train from the same platform, same route, and same destination when one exists.
- Reminder offsets: use relative reminders at **25, 20, 10, and 5 minutes** before the target departure.
- Delay rechecks: use the recommended behaviour: continue checking every 2 minutes until the departure time or until a cancellation/replacement final message is sent.
- Telegram delivery: use the configured Telegram bot/chat only for now.

## Intended behaviour

A user should be able to select a specific train or bus from loaded route details and create a recurring watch rule, for example Redfern to Rockdale around 10–11 pm on Monday to Friday.

For each active service watch, the scheduler should:

1. Resolve the target service around the selected departure time in `Australia/Sydney` time.
2. Prefer the originally selected service when it can be matched.
3. If the original selected service is cancelled, notify the user immediately.
4. After cancellation, look for a replacement service on the same route, same destination, and same platform, preferring the next available train.
5. Send reminder alerts at 25, 20, 10, and 5 minutes before departure.
6. Send delay updates at 2-minute intervals while the delay remains relevant.
7. Stop delay rechecks at departure time or after a cancellation/replacement final message.

## Implementation notes

The current code already stores route card ID, departure time, recurrence days, one-time date, fixed reminder offsets, change-check offsets, selected trip ID, and selected platform on `AlertSchedule`. The scheduler should be extended with a stronger matching model because TfNSW trip IDs may change across days.

Recommended new or expanded fields:

- `targetRoute`
- `targetDestination`
- `timezone`
- `delayRecheckMinutes`
- `fallbackWindowMinutes`
- `notifyOnCancellationImmediately`
- replacement tracking in alert delivery state

Recommended backend matching order:

1. Same route/line.
2. Same destination.
3. Same platform.
4. Closest departure time to the saved target time.
5. Same trip ID only as a same-day bonus, not as the recurring identity.


## Implementation status

Implemented in the scheduler MVP:

- Schedules save target route, destination, timezone, fallback window, cancellation notification, and delay recheck settings.
- The scheduler resolves the watched service around the Sydney-local target departure time.
- Cancellation sends a Telegram alert and auto-switches reminders to the next matching same-platform, same-route, same-destination service within the fallback window.
- Fixed reminders use 25, 20, 10, and 5 minutes.
- Delay alerts repeat using the configured 2-minute recheck interval until departure.

Future improvements:

- Add richer UI controls for changing fallback and delay policy per alert.
- Expose replacement/delivery state in the schedule list.
- Add integration tests with mocked TfNSW and Telegram responses.

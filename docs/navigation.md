# Navigation mode

Start: tap ◎ (my location as start) or set a start by tapping the map, set the
destination, then ▶. Stop with ✕ in the bottom bar.

- **Display:** the panels are hidden. On top the next instruction ("In 250 m rechts abbiegen");
  at the bottom the speed limit of the current section, remaining distance and
  time, and the arrival time. The OSM attribution stays visible below the bar (ODbL).
- **Map:** follows the position at zoom 16.5, rotated in the direction of travel (device heading
  when moving, otherwise from the last fixes). Panning pauses following; ◎ on the right resumes.
- **Instructions:** derived from the route geometry at junctions (`web/src/nav/maneuvers.ts`): turns
  sharper than 35° (`NAV_TURN_MIN_DEG`), classified slight / normal / sharp. The graph has no
  street names, so instructions name no streets; roundabouts are not special-cased yet.
- **Off route:** more than 40 m (or the GPS accuracy, if worse) from the route for 3 consecutive fixes
  → new route from the current position to the destination (`NAV_OFF_ROUTE_*`).
- **Arrival:** within 30 m of the destination.
- **Screen:** the Screen Wake Lock API keeps the display on (iOS 16.4+, Chrome); it is re-requested
  when the app returns to the foreground.

- **Voice guidance** (`web/src/nav/voice.ts`, `speech.ts`): device speech synthesis, offline. Per turn an
  early announcement ("In 300 Metern links abbiegen", earlier when fast: 20 s of travel) and "Jetzt …" shortly
  before (40 m or 4 s); arrival and reroutes once. 🔊/🔇 in the bottom bar, stored per device. The first
  announcement is spoken inside the ▶ tap because iOS only allows speech after a user gesture.

## Limitations
- iOS: no background GPS for web apps; the screen must stay on and the app in the foreground.
- No lane guidance, no street names in instructions (the graph has none).
- Rerouting needs the destination inside the loaded area.

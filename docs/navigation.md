# Navigation mode

Start: tap ◎ (my location as start) or set a start by tapping the map, set the
destination, then ▶. Stop with ✕ in the bottom bar.

- **Display:** the panels are hidden. On top the next instruction ("In 250 m rechts abbiegen");
  at the bottom the speed limit of the current section, remaining distance and
  time, and the arrival time. The OSM attribution stays visible below the bar (ODbL).
- **Map:** follow camera (`nav/camera.ts`) at zoom 16.5. The position marker is glued to one spot on
  screen, 72 % down (`NAV_POSITION_FROM_TOP`, via map padding), so most of the view shows the road
  ahead; the map turns with the road. GPS gives ~1 fix/s, so each fix sets a target — on the route the
  position predicted for the next fix (projected onto the route + speed × fix interval) with the
  road's direction over the next 25 m; more than 25 m off the route (`NAV_SNAP_M`) the raw GPS position
  and heading — and camera and marker glide there linearly over the fix interval. Panning pauses
  following; ◎ on the right resumes.
- **Route line:** only the part still ahead is drawn (redrawn every 5 m); the whole route returns
  when navigation stops.
- **Battery:** camera frames capped at 30/s (`NAV_CAMERA_FPS`), no drawing while standing still,
  device pixel ratio capped at 2 during navigation (`NAV_MAX_PIXEL_RATIO`; 3x phones draw ~45 %
  fewer pixels), label fade off (`fadeDuration: 0`: with a moving camera the fade kept MapLibre
  redrawing at ~74 fps; now ~25 fps measured in the simulation).
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

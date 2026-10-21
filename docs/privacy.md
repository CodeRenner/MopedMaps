# Privacy: what data leaves the device

Factual basis for the privacy notice `web/public/datenschutz.html` (linked with `web/public/impressum.html` from the
attribution (i)). Not legal advice. Keep both in sync with this table; the deploy refuses `[[placeholders]]`.

| What | Where it goes | Why |
|------|---------------|-----|
| App files, graph tiles, search data, `closures.json` | Cloudflare Pages (`mopedmaps.pages.dev`) | Hosting. Cloudflare sees IP address, user agent and requested URLs (which tiles → roughly which area). |
| Basemap tiles, style, fonts | OpenFreeMap (`tiles.openfreemap.org`) | Background map. OpenFreeMap sees IP address and the map area viewed. |
| Bug reports (only if the user opens one) | GitHub | Issue form; public. |

Stays on the device only (localStorage / IndexedDB, never sent): vehicle settings, favourites and recent
destinations, last area, downloaded graph chunks, learned consumption, voice setting, the welcome flag.
GPS positions are used in the browser only (navigation, ride metering) and never sent. Voice guidance uses
the browser's speech synthesis (local on iOS; some Chrome voices on desktop/Android are cloud voices of
Google — the spoken text, not the position). No cookies, no analytics, no ads, no accounts.

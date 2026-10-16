# Local environment UAT

Prepared 16 October 2026 for the MHRI time, weather, season and moon update.

**Status:** deterministic automated tests cover the environment logic, provider boundary and HTTP server. Interactive browser automation was unavailable in this implementation session. The desktop/mobile visual checks below remain **pending manual UAT**; this document does not claim they passed.

Use [mhri.net](https://mhri.net/) for the deployed experience. Open **About the painting** at the bottom right. Allow a few seconds for a cold Fly machine, provider response and the selected landscape/sky images to load. Record browser, device/viewport, selected city, time/weather/season choices, and a screenshot for any visual problem.

## First visit and local conditions

1. Confirm the full figure, sheep, crook and feet remain visible on desktop and portrait mobile. Check the MHRI lettering and footer readability at the darkest and lightest times of day.
2. Open About. **Local time & weather** should start on for a fresh browser; an existing saved off preference remains off. **Neuromancer mode** starts off every reload. Cloud speed starts at 3× unless a later saved adjustment exists.
3. Check the displayed approximate city, IANA time zone and local clock. IP lookup can identify a VPN or internet-provider location; it is not GPS. Different time zones within a large country must not collapse to a country-wide default.
4. Check that the description reports the expected local period and hemisphere's season. A tropical location should retain green foliage. Temperature and weather are modeled local estimates, not a claim about the viewer's exact street.
5. Turn **Local time & weather** off. The established landscape should return and the new moon/weather effects should disappear. Turn it back on and confirm local conditions recover.

## City search and persistence

1. Expand **Not your area? Choose a city** and search for `Toronto`. Select the Ontario, Canada result; confirm the city and `America/Toronto` zone.
2. Change to `Perth` in Western Australia, then `São Paulo` or `Singapore`. Check that the display follows each chosen city's time, hemisphere and weather rather than the device's time or Fly's Toronto region.
3. Reload. The selected city should remain in this browser. A private window should have its own selection; blocking local storage must not prevent the page from functioning.
4. Use **Use my approximate IP location** and reload. The explicit city override should be gone.
5. Enter a city with no matches and confirm a helpful message. A provider failure should say search is unavailable, not falsely claim the city does not exist.
6. When possible, simulate a connection failure after choosing a city. The known city should retain its astronomical clock and season, while unavailable weather is disclosed. **Retry** should recover when the connection returns. With no known location, the device clock is an explicit fallback and the site must not invent live weather.

The selected city is stored under `mhri-place`; viewing settings are under `mhri-view`. The raw visitor IP is not displayed or saved by this application. City search is debounced; avoid repeatedly clicking Retry or firing scripted search bursts against the live providers.

## Atmosphere previews

Expand **Explore the other skies**. The three selectors are independent. A non-Automatic selection should clearly show **Preview** in the scene description. **Return to local conditions** resets all three; changing previews must not overwrite the saved city. Preview settings are temporary and should reset on reload.

| Selector | Choices to inspect |
| --- | --- |
| Time of day | Dawn, Day, Dusk, Night |
| Weather | Clear, Partly cloudy, Overcast, Rain, Snow, Mist & fog, Storm |
| Season | Spring, Summer, Autumn, Winter |

The automated matrix covers all **4 × 7 × 4 = 112** combinations, checking that they resolve to available landscape/sky assets, bounded moon opacity and finite lighting filters. It does **not** inspect screenshots or certify every combination's artistic quality. For manual review, start with the representative combinations below, then explore any combination that looks inconsistent.

| Preview | Expected visual behavior |
| --- | --- |
| Day / Clear / Spring | Fresh foliage and a readable original figure; no precipitation. |
| Dawn / Clear / Summer | Restrained rose/gold sky and lighting, without moving tree silhouettes. |
| Dusk / Partly cloudy / Autumn | Warm dusk sky, autumn foliage, readable figure and foreground. |
| Night / Clear / Summer | Dark but readable landscape, subtle stars and a phase-aware moon when its illumination permits. |
| Night / Overcast / Summer | No visible moon or baked star field; a dark, continuous cloudy sky. |
| Night / Mist & fog / Autumn | Moon hidden, softened distance and fog without an opaque veil over the face. |
| Day / Rain / Spring | Damp landscape, restrained falling rain and small ground ripples; no snowflakes. |
| Dusk / Storm / Autumn | Dense cloud and rain; no flashing lightning or audio. |
| Day / Snow / Winter | Separate snow landscape and soft falling flakes at several depths. |
| Night / Snow / Spring | Snow is driven by weather, even outside winter; night lighting remains readable. |
| Day / Clear / Winter | Dormant vegetation without invented snowfall or an automatic snow-covered scene. |

Check sky/landscape alignment around tree canopies, shoreline and horizon as the clouds move. Sparse winter/snow branches are especially worth inspecting because the original landscape mask was drawn around leafy trees. Check that no old ground or sky fragments move with the figure and that the foot shadow remains confined to nearby ground.

## Moon behavior

- In Automatic time, phase, illuminated fraction, orientation and above/below-horizon state are calculated for the selected location and current date. A clear night does not guarantee the moon is above the horizon. A near-new moon may be barely visible.
- Night preview preserves today's phase but gives the moon a demonstration altitude. It does not force a full moon and does not claim the preview altitude is currently real.
- Compare Night/Clear with Night/Overcast, Mist & fog and Storm. Dense clouds must conceal the moon and overcast sky must not retain the clear-night stars.
- Return to Automatic after previewing. A moon below the real horizon should disappear again.
- The moon's location on the screen is a compositional approximation; the painting is not an accurately oriented sky chart.

## Motion, original view and Neuromancer

1. With rain or snow active, turn **Motion** off. Cloud, cloth, parallax and weather animation should stop while a static atmosphere remains. Turning Motion on should resume gently without an image jump.
2. Move the Cloud speed slider through 0×, 1× and 4×. At 4× the established horizontal cycle is about 30 seconds; trees should remain separate from the moving sky.
3. Enable the device's reduced-motion preference and reload. Check static rain/snow/mist and no flashing or animated signal effects. Existing motion controls should remain usable.
4. Switch away from the tab, then return. Animation should not leap across the screen; the clock should update, with conditions refreshed after a sufficiently long absence.
5. Enable **Show original painting**. Confirm the supplied complete portrait is shown without the new environment, precipitation or moon. It should turn Neuromancer off. Turn Original off to return to the scene.
6. Enable **Neuromancer mode** with a night and a rainy preview. RGB separation/scan lines should coexist with the chosen scene while the painting remains legible. Motion off freezes the animated signal treatment. Reload and confirm Neuromancer is off again.
7. Operate About, switches, city results and selects with the keyboard. Escape should close the dialog, focus should remain visible, and the mobile controls should not overflow horizontally.

## Automated checks and limits

Run `npm test` for mocked server/provider tests, astronomy regressions and the 112-combination asset-selection matrix. Run `npm run build` for the TypeScript and Vite production build. With `npm start` running locally, `node scripts/check-server.mjs http://127.0.0.1:8080` checks HTTP behavior and the expected no-Fly-location fallback.

In local development the API intentionally does not geolocate the server. Run the Node server alongside Vite and use a selected city. Vite's static `npm run preview` alone is not an API-backed test.

Automated coverage includes public-IP validation, provider errors and timeouts, cache deduplication, request budgets, invalid city/coordinate/time-zone inputs, saved-location fallback, calm/north wind, stale weather, opposite-hemisphere seasons, polar astronomy and moon/cloud visibility. It does not replace visual review, long-running browser performance measurements, assistive-technology testing or a formal accessibility audit.

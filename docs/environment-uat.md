# Local environment UAT

Prepared 16 October 2026 for the MHRI time, weather, climate-aware foliage, ground snow and independently layered sky update.

**Status:** deterministic automated tests cover environment logic, the actual climate raster, foliage rules, snow-depth validation, provider boundaries and HTTP behavior. Targeted local browser checks of the revised sky have also been performed, as recorded below. Broader climate, season, precipitation and device UAT remains pending. The existing [ALICE gallery](https://mhri.net/uat/alice/us-cities-20261016-1552/index.html) is a **pre-climate, pre-ground-snow and pre-layered-sky baseline**: 27 of 30 jobs returned ready screenshots with live weather before these revisions. No new ALICE batch was run. Neither the gallery nor the local checks establish production deployment of this revision.

Use [mhri.net](https://mhri.net/) for the deployed experience. Open **About the painting** at the bottom right. Allow a few seconds for a cold Fly machine, provider response and the selected landscape/sky images to load. Record browser, device/viewport, selected city, time/weather/season/ground-snow choices, and a screenshot for any visual problem.

## Completed local sky checks — 16 October 2026

Browser inspection at **1280 × 720** and **390 × 844** covered Night/Clear, Night/Partly cloudy and Night/Overcast:

- The moon showed illuminated NASA surface detail without a painted dark disc. On mobile its 35px display size matched a 16.625px full-disc star-occlusion radius.
- The star layer's own transform remained `none` while the cloud transform changed, confirming that stars did not drift with clouds.
- Overcast state reported star opacity 0, moon opacity 0 and cloud opacity 1, with a continuous cloud deck.
- The 390px viewport had no overflow after the scene container used `overflow: clip`, preventing dialog focus from internally scrolling the oversized artwork.
- At **2060 × 900**, Night/Clear browser checks verified the corrected leafy matte and the winter `dormant.svg` matte. The sky showed through leafy and bare-branch openings without vertical sky rectangles; the winter scene retained a zero internal scroll offset. Nine active plates were also inspected in offline composites, SVG alpha matched the builder reference, and regeneration was byte-identical.

These are targeted local checks, not a pass of every checklist item below or confirmation of production deployment.

## First visit and local conditions

1. Confirm the full figure, sheep, crook and feet remain visible on desktop and portrait mobile. Check the MHRI lettering and footer readability at the darkest and lightest times of day.
2. Open About. **Local time & weather** should start on for a fresh browser; an existing saved off preference remains off. **Neuromancer mode** starts off every reload. Cloud speed starts at 3× unless a later saved adjustment exists.
3. Check the displayed approximate city, IANA time zone and local clock. IP lookup can identify a VPN or internet-provider location; it is not GPS. Different time zones within a large country must not collapse to a country-wide default.
4. Check the displayed local period, foliage label and the explanatory sentence beneath it in About. Automatic foliage should follow mapped climate and supported multi-week conditions, rather than assigning orange leaves to every city in calendar autumn. Temperature and weather are modeled local estimates, not a claim about the viewer's exact street or tree species.
5. Turn **Local time & weather** off. The established landscape should return and the new moon/weather effects should disappear. Turn it back on and confirm local conditions recover.

## City search and persistence

1. Expand **Not your area? Choose a city** and search for `Toronto`. Select the Ontario, Canada result; confirm the city and `America/Toronto` zone.
2. Change to `Perth` in Western Australia, then `São Paulo` or `Singapore`. Check that the display follows each chosen city's time, climate and weather rather than the device's time or Fly's Toronto region.
3. Reload. The selected city should remain in this browser. A private window should have its own selection; blocking local storage must not prevent the page from functioning.
4. Use **Use my approximate IP location** and reload. The explicit city override should be gone.
5. Enter a city with no matches and confirm a helpful message. A provider failure should say search is unavailable, not falsely claim the city does not exist.
6. When possible, simulate a connection failure after choosing a city. The known city should retain its astronomical clock; previously known climate can support foliage, while unavailable weather is disclosed. **Retry** should recover when the connection returns. With no known location/classification, the device clock is an explicit fallback and foliage should stay neutral green; the site must not invent live weather.

The selected city is stored under `mhri-place`; viewing settings are under `mhri-view`. The raw visitor IP is not displayed or saved by this application. City search is debounced; avoid repeatedly clicking Retry or firing scripted search bursts against the live providers.

## Climate and foliage inspection

Leave all preview selectors on **Automatic** for these checks. Use city search to select the stated city/country and read the **foliage reason in About**, not just the weather description. A selected city must replace the previous location promptly; a previous city's history or climate must not remain attached to the new city while its request is pending.

| City | Expected automatic treatment and reason |
| --- | --- |
| Los Angeles, California, US | Mediterranean green or dry Mediterranean foliage, depending on recent conditions. Calendar autumn alone must not produce orange leaves or a bare winter. |
| San Francisco, California, US | Mediterranean green or a supported dry treatment, with the same protection from automatic orange autumn. The climate lookup is coordinate-based even though it shares a time zone with inland mountain locations. |
| Toronto, Ontario, Canada | Continental treatment. In established autumn, shortening daylight supports autumn foliage even during a warm recent interval. Dormancy and spring behavior should reflect the relevant seasonal/daylight gates. |
| Singapore, Singapore | Rainforest green regardless of the temperate season elsewhere. A short dry spell must not invent temperate autumn. |
| Quito, Ecuador | Green or supported dry foliage, never a temperate four-season leaf cycle caused by cool equatorial conditions. This pinned dataset maps the selected area to Csb; the displayed reason can therefore describe the Mediterranean proxy rather than a generic “highland” label. |

The raster is a specific climate-normal dataset, not a list of conventional city labels. Nearby coordinates can change its result, especially near coasts or in mountains. Check [climate-data.md](climate-data.md) if a classification seems surprising; do not silently substitute a remembered city climate.

For dry conditions, inspect the separate dry landscape: muted olive foliage and dry ground should preserve the painting's composition. Select **Rain** while keeping Season on Automatic. Dry foliage should remain dry beneath the wet-light/rain treatment; a shower must not instantly replace it with lush summer leaves. Select **Snow** and **Ground snow → Bare ground** to check falling flakes without an invented snowpack. Ground cover and precipitation are independent.

Switch Season to Autumn or Winter in Los Angeles or Singapore. This **deliberate preview must still work**, with a preview label and a reason explaining the manual override. Return Season to Automatic and verify climate-based foliage returns. Changing Time of day alone should relight the selected foliage without forcing calendar seasons or replacing it with a prepainted dawn, dusk or night landscape.

The backend summarizes up to 28 completed local days and returns history with at least 14 valid records; the foliage rules require at least 21 consistent samples, at least 75% interval coverage, an interval no longer than 35 days and a recent end date. A single cold reading must not cause leaf loss. History-only outages retain a prior valid summary for the same location for up to six days, with its original dates; failed refreshes must not extend retention, and changing cities must not reuse the old city's context. Automated tests cover invalid/stale history, current/history failures independently and the separate caches; manual inspection should confirm that live weather remains usable if history is unavailable and that the About reason remains understandable. Do not present climate normals or this artistic proxy as observed vegetation.

## Atmosphere previews

Expand **Explore the other skies**. Time of day, Weather, Season and Ground snow are independent selectors. A non-Automatic selection should clearly show **Preview** in the scene description. **Return to local conditions** resets all four; changing previews must not overwrite the saved city. Preview settings are temporary and should reset on reload.

| Selector | Choices to inspect |
| --- | --- |
| Time of day | Dawn, Day, Dusk, Night |
| Weather | Clear, Partly cloudy, Overcast, Rain, Snow, Mist & fog, Storm |
| Season | Spring, Summer, Autumn, Winter |
| Ground snow | Automatic, Bare ground, Patchy snow, Snow-covered |

The time/weather/season/ground matrix covers **4 × 7 × 4 × 4 = 448** explicit preview combinations, checking that they resolve to available landscape/sky assets, bounded moon opacity and finite lighting filters. Ground snow also has separate depth, freshness and preview-precedence tests. Separate tests cover climate-driven automatic foliage and the dry landscape; dry is not an additional Season selector. These tests do **not** inspect screenshots or certify every combination's artistic quality. For manual review, start with the representative combinations below, then explore any combination that looks inconsistent.

| Preview | Expected visual behavior |
| --- | --- |
| Day / Clear / Spring | Fresh foliage and a readable original figure; no precipitation. |
| Dawn / Clear / Summer | Restrained rose/gold sky and lighting, without moving tree silhouettes. |
| Dusk / Partly cloudy / Autumn | Warm dusk sky, autumn foliage, readable figure and foreground. |
| Night / Clear / Summer | Dark but readable landscape, fixed subtle stars and a textured phase-aware moon when its illumination permits. |
| Night / Overcast / Summer | No visible moon or stars; a dark, continuous opaque cloud deck. |
| Night / Mist & fog / Autumn | Moon hidden, softened distance and fog without an opaque veil over the face. |
| Day / Rain / Spring | Damp landscape, restrained falling rain and small ground ripples; no snowflakes. |
| Dusk / Storm / Autumn | Dense cloud and rain; no flashing lightning or audio. |
| Day / Snow / Winter / Snow-covered | Snow-covered dormant landscape and soft falling flakes at several depths. |
| Night / Snow / Spring / Bare ground | Falling snow outside winter without automatically inventing settled snow; fresh foliage and night lighting remain readable. |
| Day / Clear / Winter / Bare ground | Dormant vegetation without invented flakes or snowpack. |
| Day / Clear / Summer / Snow-covered | Green canopy with settled snow and no flakes; uses the evergreen snow plate. |
| Day / Clear / Summer / Patchy snow | Broken patches of ground snow with retained green foliage and no flakes. |

Check sky/landscape alignment around tree canopies, shoreline and horizon as the clouds move. `winter`, `snow` and `snow-patchy-dormant` use a dedicated dormant-branch matte; other active plates use the leafy matte. Confirm each selected mask finishes decoding before the scene changes, with sky visible through branch openings and terrain/water intact. Check that no old ground or sky fragments move with the figure and that the foot shadow remains confined to nearby ground.

## Ground snow independently of falling snow

**Automatic** ground snow uses a fresh modeled depth in metres (`weather.snowDepthM`), validated between **0 and 100m** with the provider's metre unit. It shares the current-weather freshness limit of three hours. Depths below **0.5cm** leave the ground bare, **0.5cm to under 5cm** select patchy artwork, and **5cm or more** select snow-covered artwork. These thresholds are art-direction bands, not measured ground coverage fractions. A valid zero is meaningful and must not be replaced by old depth or by the total snowfall in the 28-day history.

The full-cover plate is `snow-evergreen.webp` for green, fresh or dry foliage and the existing `snow.webp` for autumn or dormant foliage. Patchy cover similarly uses `snow-patchy.webp` for the retained green canopy and `snow-patchy-dormant.webp` for autumn/dormant foliage. These are broad artistic variants rather than separate snow assets for every leaf state. Inspect canopy alignment and the figure's ground shadow at each setting. Previewing ground snow must not itself start or stop precipitation particles.

1. **Clear weather with settled snow:** select **Clear** and **Snow-covered**. Confirm snow remains on the ground without falling flakes. Repeat with Autumn/Winter and Spring/Summer to inspect both full-cover plates, then repeat with **Patchy snow** to inspect its green and dormant variants. Then choose **Snow** and **Bare ground**; flakes should fall over the selected snow-free foliage plate.
2. **Antarctic modeled snowpack:** when a station is available in city search, inspect McMurdo or South Pole with all controls Automatic. A positive fresh depth should support ground snow even when WMO conditions indicate clear or cloudy weather and reported snowfall is zero. A read-only API sample at **2026-10-16 16:45 UTC** returned McMurdo **2.99m**, WMO 1 and zero snowfall, and South Pole **20.44m**, WMO 3 and zero snowfall. These samples establish provider behavior, not a completed browser test or a promise of present conditions. The API coordinates used were −77.8, 166.7 (`Antarctica/McMurdo`) and −90, 0 (`Antarctica/South_Pole`); local fixture testing can use these if city search lacks the stations.
3. **Melting/zero-depth update:** test a current-weather fixture that changes from positive depth to a fresh zero after cache expiry. Automatic snow cover should clear while the foliage treatment remains. A positive air temperature alone must not erase a still-positive modeled pack. The new zero must outrank an older positive depth and any historical snowfall total.
4. **Unavailable or stale depth:** test missing/null/negative values, non-metre units, out-of-range depth, and current weather older than three hours. Automatic mode should disclose unknown ground snow and avoid fabricating a pack; valid remaining live-weather fields should still work when only depth is invalid. A cold day, a polar climate code or current flakes alone must not substitute for missing ground depth.
5. **Reset and isolation:** Return to local conditions, reload, and switch cities. Ground previews must reset as specified, and a prior city's snow depth must not remain attached to the new city. **Show original painting** must show the untouched portrait without added snow; Motion off and reduced motion must retain the static ground cover while stopping flake movement.

Snow depth is a weather-model estimate of surface snow, **not a glacier or permanent-ice mask**. It does not establish measured Antarctic ice-sheet thickness or accurately depict local polar vegetation. The retained woodland and path remain part of this interpretive artwork.

## Sky layers and moon behavior

The scene order is solar sky color, fixed transparent SVG stars, the independently rendered moon, then moving cloud material. The sky gradient follows solar altitude; the neutral clouds receive a separate lighting treatment. The [20-asset manifest](../public/art/environments/manifest.json) includes thirteen landscapes, five retained legacy sky plates and two current cloud materials. The local-environment renderer must not use a combined legacy sky plate as its moving clouds.

Terrain always uses a normally lit foliage, wet-ground or snow material. In Automatic time, terrain/figure illumination and shadow strength vary continuously with solar altitude; cloud cover and precipitation can dim or soften that illumination while the underlying sky-color gradient stays time-based. With a local clock fixture, inspect a transition across dawn or dusk and confirm there is no landscape-image swap or abrupt light jump. The separate manual time presets intentionally select representative sun altitudes rather than simulate a time-lapse.

1. Compare Day, Dawn, Dusk and Night with Clear weather. The sky color should change coherently, without a rectangular sky image moving over another background. Time previews use representative sun altitudes: 30°, −2°, −2° and −24°, respectively. Automatic time uses the selected location and current date; previews do not claim those sample altitudes are current.
2. Set Night / Partly cloudy and cloud speed to 4×. Cloud shapes should move while the stars remain fixed. Transparent gaps must reveal the same underlying sky color, and cloud edges should remain soft without a painted blue or black backing. Inspect desktop and mobile crops.
3. Compare Night / Clear with Night / Overcast, Mist & fog and Storm. Dense cloud must conceal the moon and stars; overcast must form a continuous deck without clear-sky holes. Repeat in Day to check that overcast is lit appropriately while the underlying sky's solar palette remains time-based.
4. Inspect a crescent and a gibbous phase using a controlled local date fixture when needed. Only the illuminated lunar surface should be visible, with NASA-derived surface detail. The unlit portion must not appear as a black or blue disc, and stars must not show through that unlit portion. Clouds should pass in front of the moon. [Texture credit and limits](moon-imagery.md).
5. In Automatic time, phase, illuminated fraction, orientation and above/below-horizon state follow the selected location and current date. A clear night does not guarantee the moon is above the horizon. A near-new moon may be barely visible. A suitable moon above the horizon may also appear in daylight; day alone must not force it off.
6. Night preview preserves today's phase but gives the moon a demonstration altitude. It must not force a full moon. Return to Automatic and confirm a moon below the real horizon disappears again.

The star positions are decorative, and the moon's screen position is a compositional approximation. This painting has no geographic compass bearing and is not a scientific sky chart.

## Motion, original view and Neuromancer

1. With rain or snow active, turn **Motion** off. Cloud, cloth, parallax and weather animation should stop while a static atmosphere remains. Turning Motion on should resume gently without an image jump.
2. Move the Cloud speed slider through 0×, 1× and 4×. At 4× the established horizontal cycle is about 30 seconds; trees, sky color and stars should remain separate from the moving clouds.
3. Enable the device's reduced-motion preference and reload. Check static rain/snow/mist and no flashing or animated signal effects. Existing motion controls should remain usable.
4. Switch away from the tab, then return. Animation should not leap across the screen; the clock should update, with conditions refreshed after a sufficiently long absence.
5. Enable **Show original painting**. Confirm the supplied complete portrait is shown without the new environment, precipitation or moon. It should turn Neuromancer off. Turn Original off to return to the scene.
6. Enable **Neuromancer mode** with a night and a rainy preview. RGB separation/scan lines should coexist with the chosen scene while the painting remains legible. Motion off freezes the animated signal treatment. Reload and confirm Neuromancer is off again.
7. Operate About, switches, city results and selects with the keyboard. Escape should close the dialog, focus should remain visible, and the mobile controls should not overflow horizontally.

## Automated checks and limits

Run `npm test` for mocked server/provider tests, astronomy regressions and the 448-combination asset-selection matrix. Run `npm run build` for the TypeScript and Vite production build. With `npm start` running locally, `node scripts/check-server.mjs http://127.0.0.1:8080` checks HTTP behavior and the expected no-Fly-location fallback.

In local development the API intentionally does not geolocate the server. Run the Node server alongside Vite and use a selected city. Vite's static `npm run preview` alone is not an API-backed test.

Automated coverage includes public-IP validation, provider errors and timeouts, cache deduplication, request budgets, invalid city/coordinate/time-zone inputs, saved-location fallback, calm/north wind, stale weather, opposite-hemisphere seasons, polar astronomy and moon/cloud visibility. Climate-specific checks cover real raster cells and bounded coastal fallback; Mediterranean/rainforest/continental/highland foliage rules; insufficient, inconsistent or stale history; local-date bounds; concurrent current/history fetches; 24-hour history caching; and continued live weather when history fails. Snow-depth checks cover positive and zero depths, deep polar snow, units/range validation, missing data without losing live weather, no carryover into a new observation, and no inference from historical snowfall. Ground-resolution checks distinguish pack from flakes, validate freshness and thresholds, and preserve independent preview behavior. These do not replace visual review, long-running browser performance measurements, assistive-technology testing or a formal accessibility audit.

Real Mapterhorn DEM fixtures, retrieved 2026-10-24.

Source and attribution: https://mapterhorn.com/attribution

Tiles:

- https://tiles.mapterhorn.com/16/34823/22978.webp
- https://tiles.mapterhorn.com/16/34824/22978.webp

The WebP files are the unmodified source tiles (512 × 512 pixels each). The JSON contains two 64 × 64 crops of decoded native elevations: a steep terrain break and a crop crossing the boundary between these adjacent tiles. No resampling or elevation rounding was applied. Terrarium decoding is `R * 256 + G + B / 256 - 32768` metres.

Unit tests compare the conservative shared mesh against the original moving stencil on these native pixels. Browser tests decode the actual WebP in a worker and intercept network requests, so they run offline and cannot silently use a different tile version.

ÖTK-Klettergarten regression fixture, retrieved 2026-10-25:

- https://tiles.mapterhorn.com/16/35689/22827.webp (unmodified terrain tile)
- https://lager.felsverzeichnis.at/api/fs/europe/austria/lower-austria/gutensteiner-alpen/hohe-wand/bereich-postl-oetk/oetk-klettergarten/oetk-klettergarten.json (polygon geometry only)

The constant-distance regression checks that blocked connections receive validated transit waypoints without changing capture positions or taking photos during transit.

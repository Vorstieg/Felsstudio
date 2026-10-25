# Flight-plan terrain calculations

The editor sends a polygon and serializable options to a dedicated worker. It does not query the displayed map for terrain. Each job selects a fixed Mapterhorn zoom with ground-pixel spacing at most approximately 1 m at the polygon centroid, fetches 512-pixel Terrarium WebP tiles, and copies the native pixel lattice into a bounded snapshot. The snapshot records its zoom and pixel coordinates. Changing map zoom or terrain exaggeration cannot change a job's heights.

Coverage comes from the polygon's principal-axis bounds, expanded for stand-off, convergence, curved patterns, uphill-facing probes, and the entire clearance stencil. Tile-boundary neighbors and a one-pixel interpolation border are included. Missing tiles, transparent pixels, and out-of-coverage samples fail explicitly rather than substituting zero height or a different zoom.

The worker constructs a Float64, source-aligned triangle mesh and a BVH. Source sampling retains bilinear interpolation. A conservative bound accounts for the difference between bilinear patches and triangles, Mercator-to-local latitude distortion, and the old moving stencil's interpolation. A BVH result can accept a sample immediately only beyond this bound. Otherwise, the original local stencil is evaluated against the same snapshot; the result is also restricted by the native raster's conservative distance bound. This can reject additional near-boundary waypoints compared with the old sampling layout.

Jobs are bounded to 1,000 polygon vertices, 10,000 candidate waypoints, 250,000 snapshot vertices, 32 tiles, 100,000 path samples, and 2,000,000 terrain evaluations per sampler. Invalid spacing and excessive loop counts are rejected before allocating large arrays or entering long loops. The client terminates the worker on cancellation, unmount, or a 120-second timeout. Individual tile fetches time out after 20 seconds.

Validation:

- `npx vitest run tests/test-flight-plan-generator.mjs tests/test-flight-plan-terrain.mjs tests/test-flight-plan-snapshot.mjs tests/test-flight-plan-client.mjs src/lib/components/editor/crag/CragFlightPlanPanel.test.js`
- `npx playwright test tests/e2e/flight-plan.spec.js --project=chromium --project=firefox`

Regression tests compare clearance decisions against real decoded DEM fixtures. Browser tests cover native image decoding, missing tiles, cancellation, and main-thread responsiveness. The original sampler remains available for callers supplying an elevation callback directly.

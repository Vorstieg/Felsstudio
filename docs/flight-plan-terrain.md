# Flight-plan terrain calculations

The editor sends a polygon and serializable options to a dedicated worker. It does not query the displayed map for terrain. Each job selects a fixed Mapterhorn zoom with ground-pixel spacing at most approximately 1 m at the polygon centroid, fetches 512-pixel Terrarium WebP tiles, and copies the native pixel lattice into a bounded snapshot. The snapshot records its zoom and pixel coordinates. Changing map zoom or terrain exaggeration cannot change a job's heights.

Coverage comes from the polygon's principal-axis bounds, expanded for stand-off, selective oblique views, curved patterns, uphill-facing probes, and the entire clearance stencil. Tile-boundary neighbors and a one-pixel interpolation border are included. Missing tiles, transparent pixels, and out-of-coverage samples fail explicitly rather than substituting zero height or a different zoom.

The worker constructs a Float64, source-aligned triangle mesh and a BVH. Source sampling retains bilinear interpolation. A conservative bound accounts for the difference between bilinear patches and triangles, Mercator-to-local latitude distortion, and the old moving stencil's interpolation. A BVH result can accept a sample immediately only beyond this bound. Otherwise, the original local stencil is evaluated against the same snapshot; the result is also restricted by the native raster's conservative distance bound. Near the clearance threshold, interpolation errors are bounded per source cell so distant rough terrain does not penalize a clear local patch. This can reject additional near-boundary waypoints compared with the old sampling layout.

Jobs are bounded to 1,000 polygon vertices, 10,000 candidate waypoints, 250,000 snapshot vertices, 32 tiles, 100,000 path samples, and 8,000,000 terrain evaluations per sampler. Invalid spacing and excessive loop counts are rejected before allocating large arrays or entering long loops. The client terminates the worker on cancellation, unmount, or a 120-second timeout. Individual tile fetches time out after 20 seconds.

Validation:

- `npx vitest run tests/test-flight-plan-generator.mjs tests/test-flight-plan-terrain.mjs tests/test-flight-plan-snapshot.mjs tests/test-flight-plan-client.mjs src/lib/components/editor/crag/CragFlightPlanPanel.test.js`
- `npx playwright test tests/e2e/flight-plan.spec.js --project=chromium --project=firefox`

Regression tests compare clearance decisions against real decoded DEM fixtures. Browser tests cover native image decoding, missing tiles, cancellation, and main-thread responsiveness. The original sampler remains available for callers supplying an elevation callback directly.

For every capture pattern, blocked straight connections are replaced with transit waypoints above and, when needed, outward from the face. Capture positions stay fixed and transit waypoints take no photos. Every leg of a proposed detour and the complete final path are sampled at most 0.25 m apart and must pass the same terrain checks; generation still fails if no tested connection is clear. The altitude cap applies to capture points; transit waypoints can be higher.

## Camera targets and coverage

The selected wall is sampled into local 3D profiles. Detection includes all steep bands within a section, retaining terraces between them. Rows follow the profiles by surface distance, ending at each section's own crest instead of applying one global height. One overlapping grid follows the face up to its lip. Neighboring grid photos count as independent observations even when aimed at different surface samples. Every verification node and surface cell still requires two distinct viewing directions, separated by at least 8°. Oblique or elevated photos are added only where the existing photos do not meet the field-of-view, visibility or angle checks. The top band extends up to 2 m behind the crest, clipped to the selected polygon, and requires a downward view of at least 20°; a level ray along the plateau does not count. There is no mandatory second grid or full top pass. Exact duplicate grid poses are reused rather than flown twice.

Every photo retains a geographic target with an AMSL elevation. Heading and gimbal pitch point at this exact target after any clearance lift. The camera-to-target sightline is checked against the DEM, and angles outside the controllable −90° to +70° range are rejected. All aircraft points and final connections still require ground and face clearance, plus a 1 m default planning margin. The automatic nominal stand-off is calculated from the detail target and camera resolution, with a √2 allowance for the longer camera-to-subject distance of a 45° crest view. Minimum wall distance is an independent clearance floor. The actual planned stand-off is displayed separately in the editor. This reserve is a planning choice, not an estimate of DEM accuracy.

Camera profiles use the manufacturer's Mavic 4 Pro lens specifications: 28, 70 and 168 mm equivalent, with 72°, 35° and 15° diagonal fields of view. Focus limits are 2 m for the main camera and 3 m for the tele cameras. Image dimensions use the lower-resolution still mode, with a 3:2 main frame and 4:3 tele frames. Source: [DJI manufacturer specification sheet](https://device.report/m/114cf34b3617f6e09258540c4eb8f6d52d74f61902b7c0bdd08799b3b97672f1.pdf).

Automatic camera choice prefers the widest lens meeting the requested nominal GSD at the planned distance. Photo spacing follows that lens's footprint and the requested 70% overlap. Explicit API spacing options remain optional upper bounds; detail presets do not impose additional fixed spacing caps. Lateral intervals are refined where local height or shape stretches the surface, and each surface cell and the top band are additionally checked against actual 3D camera frusta and clear sightlines at their corners and center; target centers alone are insufficient. If existing photos do not cover a cell from the required distinct directions, targeted infill photos are inserted near that cell and included in the final clearance-checked flight path. Only unresolved camera coverage gaps block export; nominal surface-point distances alone do not prove a gap when actual images cover the area. Selected overview positions also take a 168 mm detail photo when its focus limit is satisfied. The KMZ sequences overview and detail photos at the same waypoint and restores the overview lens at subsequent waypoints. Transit waypoints take neither photo.

Clearance checks are cached by exact position and altitude within each job, with bounded memory. Safe row fragments are retained and connected with validated transits. Known missing views, inadequate spacing or an unresolved wall block export instead of silently labeling a partial plan complete.

Coverage is verified against the terrain model only. A height raster cannot describe overhangs, hidden recesses, vegetation, cables or features below its resolution; multiple camera angles do not remove that limitation. Estimated GSD and overlap also depend on the actual photo mode and camera calibration. Real-flight checks and a suitable 3D surface model remain necessary for those structures.

## Density regression

On the recorded ÖTK-Klettergarten terrain, using the same 2 m minimum clearance and constant-distance pattern, the presets now produce approximately:

| Detail target        | Planned stand-off | Waypoints | Verification targets |
| -------------------- | ----------------: | --------: | -------------------: |
| Standard, 1 cm/pixel |            35.9 m |        79 |                   84 |
| High, 0.7 cm/pixel   |            25.2 m |       127 |                  135 |
| Topo, 0.5 cm/pixel   |            18.0 m |       245 |                  252 |

All three pass the modeled surface, top-band, independent-view and clearance checks. These counts describe the recorded fixture, not a general requirement for crags of similar size. Verification targets are internal samples used to check coverage, not required physical features or a desired photo count. The previous default produced 4,348 waypoints and 1,400 targets because the planner stayed close, imposed extra spacing caps and duplicated the full dense grid across three passes.

These plans contain 72/120/231 grid photos and 7/7/12 supplementary views respectively. The remaining waypoint count includes transit points where necessary. Coverage samples are independent verification locations; they do not each require a dedicated camera station. The former three-grid plans at identical resolution settings had 252/405/765 waypoints.

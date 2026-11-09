# Captures and processing in Felsstudio

Open **Captures & processing** from an entry's editor navigation to work with that
entry's captures. Entry workspaces use `/felslager/captures/<entry>` and
`/felslager/reconstruct/<entry>`, matching crag editor routing. The entry path is
fixed to that entry and preserved when switching tabs. The routes without an
entry path open the global library.

1. Enter a capture name, select photos, videos or SRT files, and
   upload. Folder selection preserves relative paths. Failed uploads can be retried;
   existing filenames are skipped by default. Originals cannot be overwritten.
2. Select a saved capture under **Start processing**, choose ODM, Meshroom or RealityScan, optionally enable
   bolt detection, choose mesh surface (default), nearest vertex, or experimental
   multiple-view bolt placement, and start processing. Multiple-view placement
   falls back to the mesh surface when matching evidence is insufficient. Finish selected uploads first. Processing
   uses the capture files available when the worker prepares the run.
3. Monitor processing or request cancellation. Queued runs can cancel immediately;
   running jobs remain pending until execution stops. Stage counters show progress within the current step. New runs inherit options from the selected source.
4. Import a completed result into Studio. From an entry workspace, this adds a
   separate sector/topo to the current draft. From the global library, it creates a
   new draft at a distinct child path under the capture's entry path. Existing
   manually edited routes are preserved.
5. Edit and publish through the existing Studio publication or review flow.

The model and project metadata are imported first so the editor can open immediately.
Crops and telemetry download in the background, with selected previews and visible
thumbnails taking priority. Completed downloads persist in IndexedDB and are reused
offline. Pending downloads resume when the draft is reopened. Reviews finish pending
downloads before creating a self-contained archive; deleting a result through Studio
first caches files still needed by local drafts. Deleting backend results does not
delete imported drafts. SRT files are
retained as attachments; Studio does not infer GPS positions from them. Explicit
project GPS metadata is imported when provided.

The frontend uses the existing `VITE_FELSLAGER_URL` setting (ending in `/api/fs`)
and session cookies for `/api/captures` and `/api/processing`. Deploy the capture
processing API and the corresponding engine/detection workers together. A queued
run can wait indefinitely if its engine has no available worker; the API currently
has no worker availability endpoint. No worker credentials are used in Studio.

Uploads retry whole files, rather than partial byte ranges. After reloading,
select the saved capture and reselect the original files to retry missing uploads.
Capture deletion is rejected while processing references it; run deletion is
available only for completed, failed or cancelled runs.

## Restart from a pipeline step

On a completed, failed or cancelled run, open **Advanced options**, select
**Start from step**, configure the reconstruction engine (ODM, Meshroom or RealityScan), bolt detection
and bolt placement method as applicable, and click
**Create new run**. Only steps reported in `availableStartSteps` are offered:

- Preparing reads the current capture and runs the entire pipeline.
- Reconstructing reuses prepared images and runs reconstruction onward.
- Detecting reuses reconstruction and runs fresh bolt detection and positioning.
- Positioning reuses reconstruction and the selected source's saved detections.

Studio calls `POST /api/processing/:id/runs` with `fromStep`. Each result is
independent and records its source and start step. Preparation and reconstruction restarts let you change the engine and toggle
bolt detection. Detection and positioning reuse the existing engine and enable
detection automatically. The bolt placement method can be changed for any restart.
Missing retained inputs can make steps unavailable. Source runs cannot be deleted
while dependent runs exist; delete dependent runs first. This requires the updated
Felslager API and workers.

## Per-step settings

Studio loads controls from `GET /api/processing/options`. New runs and restarts
use the same form, including server defaults, bounds, help, conditional controls,
and advanced settings. Preparation supports video sampling, time ranges and exact
capture-relative file exclusions. Reconstruction supports quality presets and
engine-specific overrides; detection supports confidence and suppression settings;
placement supports the method and advanced multiview tuning.

Requests send structured `options`. Restart forms inherit resolved source settings
and only submit overrides for steps at or after the selected start step. Changing
the reconstruction engine clears incompatible inherited overrides with `null`.
Empty nullable inputs restore defaults. Original runs and results remain unchanged.

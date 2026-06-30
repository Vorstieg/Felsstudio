---
name: create-topo-json
description: Create Felsstudio-compatible climbing topo JSON from topo images, route sketches, climbing guide notes, pitch tables, or manually described routes. Use when Codex needs to convert a climbing topo source into a src/entries route topo JSON file, add a matching crag entry, normalize 2D coordinates, encode pitches/grades/bolts/belays/outlines/text labels, or validate topo JSON for the Felsstudio editor.
---

# Create Topo JSON (AI Import)

Use this skill when the Felsstudio AI import endpoint asks you to convert a climbing topo image or PDF into editable 2D topo data.

## Workflow

1. Read the attached `request.json`. It contains:
   - `source.path`: temporary topo image/PDF path
   - `source.mimeType`
   - `options`: mode, language, page
   - `context`: optional existing crag/sector/topo data from felslager
2. Extract facts from the source.
   - For text PDFs, try `pdftotext -layout`.
   - For scanned PDFs or empty text output, render pages with `pdftoppm` and inspect visually.
   - Compare tables, route descriptions, and sketches. Keep the primary table value in route fields and record conflicts in metadata.
3. Extract route and outline geometry with a trace-first workflow.
   - Prefer explicit vector geometry over hand-estimated coordinates when an SVG/vector preview exists.
   - Use `scripts/extract-trace.mjs <preview.svg>` for existing SVG previews, but verify the result manually because the helper may miss complex SVG constructs such as `<path>`, transforms, CSS styles, and inherited stroke attributes.
   - If only a raster image/scan is available, create a high-resolution page/image render and visually identify colored route lines, rock contours, fixed ropes, approaches, descents, labels, bolts, and belays before drafting coordinates.
   - Do not classify by geometry alone. A long or vertical line is not automatically a route; a base/rock outline can be longer than a climbing line. Use color, labels, route numbers, table order, starts/anchors, dashed styles, and surrounding context.
   - Separate candidates into `routes`, `outlines`, `fixPoints`, `textLabels`, and `unclassified/uncertain` before writing final JSON.
4. Convert extracted geometry into normalized 2D data.
   - Store every drawable point as `[x, y]` in 0..1 canvas coordinates.
   - Use `imageAspectRatio = width / height` when a source image or traced canvas size is known.
   - Preserve pitch order from bottom to top.
   - Reverse traced route polylines as needed so routes run from bottom/start to top/anchor.
   - Simplify noisy traces, but preserve meaningful traverses, corners, ledges, route crossings, shared starts, and shared anchors.
   - Snap obviously shared starts/belays/anchors when they are very close, but do not merge distinct neighboring routes.
   - When the source describes multiple distinct wall sections, sectors, towers, or buttresses (for example upper/lower, left/right, front/back), lay them out as separate non-overlapping formations in the same canvas unless the source explicitly says they overlap. Preserve their relative relationship (next to each other, stacked, or separated) and label them clearly.
5. Encode the topo using the Felsstudio editor shape:
   - Main route objects live in `routes`.
   - Multi-pitch route geometry lives in `route.pitches[].points2D`.
   - Bolts, belays, trees, and other icons live in `fixPoints`.
   - Non-route linework such as rock, approach, descent, variants, and fixed ropes lives in `outlines`.
   - Free labels such as feature names live in `textLabels`.
   - Ferrata and ladder routes that have a grade and are listed as routes belong in `routes`, not in `fixedRope` outlines.
6. Validate before returning.
   - Write the candidate topo JSON to a temporary file.
   - Run `node <skill-dir>/scripts/validate-topo.mjs <candidate-file>`.
   - For substantial geometry work, also run `node <skill-dir>/scripts/preview-layout.mjs <candidate-file> <preview.svg>` and compare the preview against the source/trace. Check route order, starts, anchors, outline placement, crossings, label space, and unused canvas area.
   - Fix issues and rerun until validation passes.
7. Return only the validated JSON object. Do not write files to `src/entries` or felslager.

## Authoring Rules

- Do not put approach, descent, variant, fixed-rope, or general rock features into route/pitch line styles. Use `outlines` with the appropriate `lineStyle`.
- Route and pitch `lineStyle` should only be `red` or `redDashed`.
- Use `fixPoints` for icon symbols only. Align bolts and belays to the route/pitch line when the source implies they are on-route.
- Use `textLabels` for short movable labels. Keep long explanations in route `description` or metadata.
- UIAA grades may be written with Arabic numerals (5, 6+, 7-) or Roman numerals (V, VI+, VII-). Store them under `_gradeScale: "uiaa"`; the backend/editor will canonicalize them to Roman numerals.
- Use structured per-route metadata when useful: guidebook stars, conflict notes, pitch count, access notes, gear notes, or seasonal restrictions.
- When source precision is low or the drawing is redrawn from a scanned guide, state that geometry is a manually normalized interpretation in metadata.
- Record geometry provenance in metadata, for example `geometrySource` (`"vector-trace"`, `"raster-scan"`, `"manual-normalized"`, or `"mixed"`), `geometryConfidence` (`"high"`, `"medium"`, or `"low"`), and `geometryNotes` for uncertain or manually adjusted routes/outlines.

## Route and Outline Extraction Rules

Use these rules whenever source imagery, a preview SVG, or a scanned topo contains linework.

### Candidate classification

- Route candidates usually have red/orange route strokes, nearby route numbers/names, a grade/table entry, bolt/belay/anchor symbols, or a clear climbing start and finish.
- Rock outline candidates usually have gray/brown/black strokes, enclose or frame multiple routes, form the wall/base/ledge shape, and do not have a route grade/name.
- Approach/descent/fixed-rope candidates are often dashed or colored differently, may start outside the wall, and may be labeled `approach`, `Zustieg`, `descent`, `Abstieg`, `Fixseil`, or `Stahlseil`.
- Ferrata or ladder lines with a listed grade/name are routes, not `fixedRope` outlines.
- Keep uncertain candidates out of route geometry until their role is resolved from labels, route tables, or visual context.

### Geometry cleanup

- Preserve relative route order from the guide/source even when coordinates need manual cleanup.
- Preserve distinct wall/sector relationships from the source: adjacent sections should be drawn side-by-side, vertically separated sections stacked, and physically separate formations kept non-overlapping. Do not place an upper/lower/left/right section on top of another unless the source explicitly indicates an overlap.
- Preserve route relationships: shared starts, shared anchors, crossings, traverses, ledges, bands, and variants.
- Avoid overfitting noisy scans. Use fewer, meaningful points instead of many jittery points.
- For multi-pitch routes, split geometry at belays or pitch boundaries when the source implies them.
- Align bolts and belays to the nearest route segment when the source implies they are on-route.

### Quality checks

- Compare the generated preview to the source before returning when geometry was extracted from a trace or scan.
- Check that routes are not accidentally encoded as rock outlines and that cliff/base outlines are not accidentally encoded as routes.
- Check that route polylines run bottom-to-top and that pitch order is bottom-to-top.
- Add `metadata.geometryNotes` for low-confidence classifications, merged/split traces, missing source details, or manual corrections.

## Schema Reference

Top level fields: `name`, `description`, `rock`, `tags`, `editorMode` (`"2d"`), `image2D` (`null`), `imageAspectRatio`, `metadata`, `routes`, `fixPoints`, `outlines`, `textLabels`.

Route object fields: `id`, `name`, `type` (`"sports-climbing"` for single-pitch sport routes, `"multi-pitch"` for multi-pitch routes, or another configured route type such as `"bouldering"`/`"trad"` when explicitly indicated), `_gradeScale`, `grade`, `lineStyle`, `points2D`, optional `pitches`.

Important: Do not use `"single-pitch"` as a route `type`; encode ordinary single-pitch climbing routes as `"sports-climbing"`.

Pitch object fields: `id`, `type` (`"pitch"`), `pitchNumber`, `grade`, `lineStyle` (`""`, `"red"`, or `"redDashed"`), `points2D`.

Fix point object fields: `id`, `type`, `position2D`, optional `rotation2D` and `scale2D`.

Valid fix point types: `bolt`, `belay`, `piton`, `hourglass`, `tree`, `abseil`, `crux`, `crack`, `chimney`, `slab`, `overhang`, `rubble`.

Outline object fields: `id`, `lineStyle`, `points2D`.

Valid outline line styles: `rock`, `approach`, `descent`, `variant`, `fixedRope`.

Text label object fields: `id`, `text`, `position2D`, `fontSize2D`, `color`, `fontWeight`.

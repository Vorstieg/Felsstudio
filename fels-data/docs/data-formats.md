# Fels data formats

This package defines the files shared by Felsstudio and Felsverzeichnis.

## File layout

For a crag with ID `example-crag`:

```text
example-crag/
  example-crag.json
  example-crag-topo.json
  main-wall/
    main-wall.json
    main-wall-topo.json
```

The exact base path is application-specific. The IDs and filenames are connected as follows:

- `<crag>.json` identifies the crag and contains a summary of its sectors.
- `<sector>.json` identifies one sector by its directory and filename.
- `<crag>-topo.json` or `<sector>-topo.json` contains route and topo data.

## `crag.json`

This is a GeoJSON `Feature`. Its top-level `geometry` is normally a `Point` containing
`[longitude, latitude]`. The `properties` object contains the crag metadata:

- `id`: stable slug used in filenames and URLs.
- `name`: display name.
- `path`: hierarchical catalog path, using slash-separated location segments.
- `type`: climbing disciplines available at the crag, such as `sports-climbing`, `bouldering`,
  and `trad`.
- `tags`: free-form classifications.
- `security`, `rock_type`, `description_de`, and `description_en`: descriptive metadata.
- `equipment`: crag-level equipment list.
- `assets.images`: image asset metadata.
- `sectors`: lightweight sector index; full sector metadata lives in the corresponding sector file.
- `topo.site` and `topo.link`: optional external topo reference.
- `date` and `updated`: ISO calendar dates.

```json
{
	"type": "Feature",
	"properties": {
		"id": "lausbubenwande",
		"name": "Lausbubenwände",
		"path": "europe/austria/lower-austria/mödling/",
		"type": ["sports-climbing", "bouldering", "trad"],
		"tags": [],
		"security": "Gut",
		"rock_type": "",
		"description_de": "Die Lausbubenwände sind nur 5 Minuten vom Efeugrat entfernt. Jedoch ist der Fels wesentlich weniger abgegriffen.",
		"description_en": "The Lausbubenwände are only 5 minutes away from the Efeugrat. However, the rock is much less polished.",
		"equipment": [],
		"assets": { "images": [] },
		"sectors": [
			{ "id": "untere-lausbubenwand", "name": "Untere Lausbubenwand" },
			{ "id": "obere-lausbubenwand", "name": "Obere Lausbubenwand" }
		],
		"topo": { "site": "", "link": "" },
		"date": "2026-07-10",
		"updated": "2026-07-29"
	},
	"geometry": {
		"type": "Point",
		"coordinates": [16.272240073630343, 48.080403726320185]
	}
}
```

## `sector.json`

This is also a GeoJSON `Feature`. The sector is identified by its directory and filename.
Persisted files may additionally include the optional top-level `crag_id` and `sector_id`
relationship fields. They are useful context for consumers but are not required for path-based
file discovery. The geometry may be a point or an area polygon.

Sector properties include:

- `id`, `name`, and numeric `sort` order.
- `type`, `tags`, `security`, and `rock_type`.
- `wallAzimuth`: compass direction faced by the wall, in degrees from north (`0`–`359`).
- German and English descriptions and approach information.
- `topo` for an optional external topo reference.
- `assets.images`,
- `path`, `equipment`, `date`, and `updated`.

The sector writer stores the geometry at the top level.
Coordinates use GeoJSON order: `[longitude, latitude]`. Polygon rings are closed by repeating
the first coordinate as the final coordinate.

## `<crag>-topo.json`

This is a custom JSON document. It contains a `routes` array and an optional document-local GeoJSON
`paths` FeatureCollection. It may contain 2D drawing layers,
3D route geometry, or both.

- `routes`: route metadata and route lines.
- `paths`: shared LineString features owned by this topo document. A path is stored once even when
  several routes use it.
- `routes[].pathRefs`: references to paths in the same document. Each reference stores the
  route-specific `role` and optional `label`; paths cannot be assigned across topo documents.
- `pitches`: multi-pitch route segments, ordered from bottom to top.
- `fixPoints`: bolts, belays, trees, and other topo symbols.
- `outlines`: rock, approach, descent, variant, or fixed-rope linework.
- `textLabels`: movable 2D annotations. `text` may contain newlines; optional `fontSize2D`,
  `color`, `fontWeight`, and `textAlign2D` fields control presentation. Renderers default missing
  values to 24 px, `#111827`, weight 600, and centered alignment.

3D topographies may additionally include:

- `routes[].points`: local `[x, y, z]` route coordinates.
- `routes[].orientation`: a route orientation vector.
- `routes[].fixPoints`: IDs referencing the document-level `fixPoints` array.
- `routes[].boltAmount` and `routes[].length`: route statistics.
- `fixPoints[].position`: local 3D symbol coordinates.
- `coordinates`: geographic `[longitude, latitude]`, optionally followed by elevation.
- `altitude`: site altitude in metres.
- `author`, `date`, and `updated`: document metadata.

3D local coordinates are distinct from the geographic `coordinates` field. `points2D` and
`position2D` remain normalized to the unit square. `outlines.lineStyle` is optional because
3D-derived topo documents may contain outlines without a style.

```json
{
	"paths": {
		"type": "FeatureCollection",
		"features": [
			{
				"type": "Feature",
				"id": "path-approach",
				"properties": { "name": "Common approach" },
				"geometry": {
					"type": "LineString",
					"coordinates": [
						[16.27, 48.08],
						[16.271, 48.081]
					]
				}
			}
		]
	},
	"routes": [
		{
			"id": "route-1",
			"name": "First Route",
			"pathRefs": [{ "pathId": "path-approach", "role": "approach", "label": "Common approach" }],
			"type": "sports-climbing",
			"grade": "5+",
			"_gradeScale": "uiaa",
			"points2D": [
				[0.25, 0.9],
				[0.28, 0.55],
				[0.32, 0.2]
			]
		},
		{
			"id": "route-2",
			"name": "Second Route",
			"pathRefs": [{ "pathId": "path-approach", "role": "approach" }]
		}
	],
	"fixPoints": [
		{
			"id": "symbol-1",
			"type": "bolt",
			"position2D": [0.32, 0.2]
		}
	]
}
```

The schema intentionally permits additional properties because the applications also carry domain
metadata, 3D route coordinates, and legacy fields. Consumers should use the documented fields for
portable behavior and preserve unknown fields when reading and writing files.

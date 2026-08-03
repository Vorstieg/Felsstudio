import { getGeometryPath } from '$lib/assets/js/geometry-path-adapters.js';
import { getEditablePath, getPathMidpoints } from '$lib/assets/js/path-geometry.js';
import { getMapHitRadius, getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';

export function createIconMarkerElement({ className, iconUrl, size = 24 }) {
	const el = document.createElement('div');
	el.className = className;
	el.style.width = `${size}px`;
	el.style.height = `${size}px`;
	el.style.backgroundImage = `url(${iconUrl})`;
	el.style.backgroundSize = 'cover';
	return el;
}

// A mission has one source of truth: its ordered waypoints.  Every map feature below is
// rebuilt from that list, rather than updating a path separately from its waypoint markers.
const FLIGHT_PATH_LEGS_SOURCE_ID = 'flight-path-legs';
const FLIGHT_PATH_SHADOW_SOURCE_ID = 'flight-path-ground-shadow';
const FLIGHT_PATH_GUIDES_SOURCE_ID = 'flight-path-vertical-guides';
const FLIGHT_PATH_WAYPOINTS_SOURCE_ID = 'flight-path-waypoints';
const FLIGHT_PATH_CAMERA_SOURCE_ID = 'flight-path-camera-view';
const DETECTED_WALL_SOURCE_ID = 'detected-wall';
const FLIGHT_PATH_ELEVATION_LAYER_ID = 'flight-path-elevation';
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };
const flightPathElevationLayers = new WeakMap();
const pendingFlightPathElevationWaypoints = new WeakMap();
const flightPathDeckOverlays = new WeakMap();

function detectedWallFeatureCollection(flightPlan) {
	const coordinates = (flightPlan?.wallDetection?.coordinates || []).filter(
		(coordinate) =>
			Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
	);
	if (coordinates.length < 2) return EMPTY_FEATURE_COLLECTION;
	const topCoordinates = (flightPlan.wallDetection.topCoordinates || []).filter(
		(coordinate) =>
			Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
	);
	const samples = (flightPlan.wallDetection.samples || [])
		.filter(
			(sample) =>
				Array.isArray(sample?.coordinates) &&
				Number.isFinite(sample.coordinates[0]) &&
				Number.isFinite(sample.coordinates[1])
		)
		.map((sample, index) => ({
			type: 'Feature',
			properties: { feature: 'detected-wall-sample', id: index, slope: sample.slope },
			geometry: { type: 'Point', coordinates: sample.coordinates }
		}));
	return {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				properties: {
					boundary: 'base',
					confidence: flightPlan.wallDetection.confidence,
					averageSlope: flightPlan.wallDetection.averageSlope
				},
				geometry: { type: 'LineString', coordinates }
			},
			...(topCoordinates.length > 1
				? [
						{
							type: 'Feature',
							properties: { boundary: 'top' },
							geometry: { type: 'LineString', coordinates: topCoordinates }
						}
					]
				: []),
			...samples
		]
	};
}

function waypointColor(waypoint) {
	if (waypoint.action === 'startInterval') return '#16a34a';
	if (waypoint.action === 'stopInterval') return '#ef4444';
	return waypoint.phase === 'transit' ? '#0aa6eb' : '#f59e0b';
}

function deckColor(waypoint, alpha = 255) {
	const hex = waypointColor(waypoint).slice(1);
	return [
		parseInt(hex.slice(0, 2), 16),
		parseInt(hex.slice(2, 4), 16),
		parseInt(hex.slice(4, 6), 16),
		alpha
	];
}

function terrainElevation(map, waypoint) {
	const elevation = map?.queryTerrainElevation?.([waypoint.longitude, waypoint.latitude]);
	return Number.isFinite(elevation) ? elevation : 0;
}

function flightPlanWaypoints(flightPlan, map) {
	return (flightPlan?.waypoints || [])
		.filter(
			({ longitude, latitude, altitude }) =>
				Number.isFinite(longitude) && Number.isFinite(latitude) && Number.isFinite(altitude)
		)
		.map((waypoint, order) => ({
			...waypoint,
			id: String(waypoint.id ?? waypoint.index ?? order),
			order,
			heightAgl: Math.max(0, waypoint.altitude - terrainElevation(map, waypoint))
		}));
}

function offsetLngLat(longitude, latitude, eastMeters, northMeters) {
	return [
		longitude + eastMeters / (111320 * Math.cos((latitude * Math.PI) / 180)),
		latitude + northMeters / 110540
	];
}

export function buildFlightPathFeatureCollections(flightPlan, map) {
	const waypoints = flightPlanWaypoints(flightPlan, map);
	const coordinates = waypoints.map(({ longitude, latitude }) => [longitude, latitude]);
	const legs = waypoints.slice(0, -1).map((start, index) => {
		const end = waypoints[index + 1];
		return {
			type: 'Feature',
			properties: {
				id: `${start.id}:${end.id}`,
				color: waypointColor(start),
				zStart: start.heightAgl,
				zEnd: end.heightAgl
			},
			geometry: {
				type: 'LineString',
				coordinates: [
					[start.longitude, start.latitude],
					[end.longitude, end.latitude]
				]
			}
		};
	});
	const verticalGuides = waypoints.map((waypoint) => ({
		type: 'Feature',
		properties: { id: waypoint.id, zStart: 0, zEnd: waypoint.heightAgl },
		// line-progress requires non-zero length. The height values remain available for a
		// Mapbox renderer while MapLibre renders this as a compact ground guide.
		geometry: {
			type: 'LineString',
			coordinates: [
				[waypoint.longitude, waypoint.latitude],
				[waypoint.longitude + 0.00000001, waypoint.latitude + 0.00000001]
			]
		}
	}));
	const selectedCameraWaypoint = waypoints.find(
		(waypoint) => waypoint.index === flightPlan?.previewWaypointIndex
	);
	let camera = EMPTY_FEATURE_COLLECTION;
	if (selectedCameraWaypoint?.phase === 'capture') {
		const heading = (selectedCameraWaypoint.heading * Math.PI) / 180;
		const target = offsetLngLat(
			selectedCameraWaypoint.longitude,
			selectedCameraWaypoint.latitude,
			Math.sin(heading) * 12,
			Math.cos(heading) * 12
		);
		const left = offsetLngLat(target[0], target[1], Math.cos(heading) * -7, Math.sin(heading) * 7);
		const right = offsetLngLat(target[0], target[1], Math.cos(heading) * 7, Math.sin(heading) * -7);
		camera = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'MultiLineString',
						coordinates: [
							[[selectedCameraWaypoint.longitude, selectedCameraWaypoint.latitude], left],
							[[selectedCameraWaypoint.longitude, selectedCameraWaypoint.latitude], right],
							[left, right]
						]
					}
				}
			]
		};
	}
	return {
		legs: { type: 'FeatureCollection', features: legs },
		shadow:
			coordinates.length > 1
				? {
						type: 'FeatureCollection',
						features: [
							{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
						]
					}
				: EMPTY_FEATURE_COLLECTION,
		guides: { type: 'FeatureCollection', features: verticalGuides },
		camera,
		waypoints: {
			type: 'FeatureCollection',
			features: waypoints.map((waypoint) => ({
				type: 'Feature',
				properties: {
					id: waypoint.id,
					order: waypoint.order,
					heightAgl: waypoint.heightAgl,
					color: waypointColor(waypoint)
				},
				geometry: { type: 'Point', coordinates: [waypoint.longitude, waypoint.latitude] }
			}))
		}
	};
}

// MapLibre deliberately drapes GeoJSON lines on terrain and has no `line-z-offset` equivalent.
// This small adapter is therefore the rendering boundary for the altitude fields above. It receives
// only derived waypoint data; it never owns or mutates the mission/path state.
function mercatorPosition(longitude, latitude, altitude) {
	const latitudeRadians = (latitude * Math.PI) / 180;
	return [
		(longitude + 180) / 360,
		(1 - Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) / Math.PI) / 2,
		altitude / 40075016.68557849 / Math.cos(latitudeRadians)
	];
}

function createFlightPathElevationLayer() {
	const empty = new Float32Array();
	let glContext;
	let program;
	let positionBuffer;
	let colorBuffer;
	let positionLocation;
	let colorLocation;
	let matrixLocation;
	let routePositions = empty;
	let routeColors = empty;
	let guidePositions = empty;
	let pointPositions = empty;
	let pointColors = empty;
	let pointOutlineColors = empty;

	const upload = (gl, buffer, data) => {
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
	};
	const preview = {
		id: FLIGHT_PATH_ELEVATION_LAYER_ID,
		type: 'custom',
		renderingMode: '3d',
		onAdd(map, gl) {
			glContext = gl;
			flightPathElevationLayers.set(map, preview);
			const vertex = gl.createShader(gl.VERTEX_SHADER);
			gl.shaderSource(
				vertex,
				'attribute vec3 a_position; attribute vec4 a_color; uniform mat4 u_matrix; uniform float u_point_size; varying vec4 v_color; void main() { gl_Position = u_matrix * vec4(a_position, 1.0); gl_PointSize = u_point_size; v_color = a_color; }'
			);
			gl.compileShader(vertex);
			const fragment = gl.createShader(gl.FRAGMENT_SHADER);
			gl.shaderSource(
				fragment,
				'precision mediump float; varying vec4 v_color; uniform float u_points; void main() { if (u_points > 0.5 && length(gl_PointCoord - vec2(0.5)) > 0.5) discard; gl_FragColor = v_color; }'
			);
			gl.compileShader(fragment);
			program = gl.createProgram();
			gl.attachShader(program, vertex);
			gl.attachShader(program, fragment);
			gl.linkProgram(program);
			positionBuffer = gl.createBuffer();
			colorBuffer = gl.createBuffer();
			positionLocation = gl.getAttribLocation(program, 'a_position');
			colorLocation = gl.getAttribLocation(program, 'a_color');
			matrixLocation = gl.getUniformLocation(program, 'u_matrix');
			// MapLibre may invoke onAdd after the first sync. Retain the latest derived
			// collection outside the layer so the first render cannot miss its waypoints.
			preview.setWaypoints(map, pendingFlightPathElevationWaypoints.get(map) || []);
		},
		setWaypoints(map, waypoints) {
			preview.waypoints = waypoints;
			if (!glContext || !program) return;
			const vertices = [];
			const colors = [];
			const guides = [];
			waypoints.forEach((waypoint, index) => {
				const ground = terrainElevation(map, waypoint);
				guides.push(
					...mercatorPosition(waypoint.longitude, waypoint.latitude, ground),
					...mercatorPosition(waypoint.longitude, waypoint.latitude, waypoint.altitude)
				);
				if (index === waypoints.length - 1) return;
				const end = waypoints[index + 1];
				vertices.push(
					...mercatorPosition(waypoint.longitude, waypoint.latitude, waypoint.altitude),
					...mercatorPosition(end.longitude, end.latitude, end.altitude)
				);
				const hex = waypointColor(waypoint).slice(1);
				const color = [
					parseInt(hex.slice(0, 2), 16) / 255,
					parseInt(hex.slice(2, 4), 16) / 255,
					parseInt(hex.slice(4, 6), 16) / 255,
					0.95
				];
				colors.push(...color, ...color);
			});
			routePositions = new Float32Array(vertices);
			routeColors = new Float32Array(colors);
			guidePositions = new Float32Array(guides);
			pointPositions = new Float32Array(
				waypoints.flatMap((waypoint) =>
					mercatorPosition(waypoint.longitude, waypoint.latitude, waypoint.altitude)
				)
			);
			pointColors = new Float32Array(
				waypoints.flatMap((waypoint) => {
					const hex = waypointColor(waypoint).slice(1);
					return [
						parseInt(hex.slice(0, 2), 16) / 255,
						parseInt(hex.slice(2, 4), 16) / 255,
						parseInt(hex.slice(4, 6), 16) / 255,
						1
					];
				})
			);
			pointOutlineColors = new Float32Array(
				Array.from({ length: waypoints.length }, () => [1, 1, 1, 1]).flat()
			);
			map.triggerRepaint();
		},
		render(gl, { defaultProjectionData }) {
			if (!program || pointPositions.length === 0) return;
			gl.useProgram(program);
			gl.uniformMatrix4fv(
				matrixLocation,
				false,
				defaultProjectionData.projectionMatrix || defaultProjectionData.mainMatrix
			);
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
			gl.enableVertexAttribArray(positionLocation);
			gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
			const draw = (positions, colors, mode, points = false, pointSize = 1) => {
				upload(gl, positionBuffer, positions);
				upload(gl, colorBuffer, colors);
				gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
				gl.enableVertexAttribArray(colorLocation);
				gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_points'), points ? 1 : 0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_point_size'), pointSize);
				gl.drawArrays(mode, 0, positions.length / 3);
			};
			draw(guidePositions, new Float32Array((guidePositions.length / 3) * 4).fill(0.6), gl.LINES);
			draw(routePositions, routeColors, gl.LINES);
			draw(pointPositions, pointOutlineColors, gl.POINTS, true, 15);
			draw(pointPositions, pointColors, gl.POINTS, true, 10);
		},
		onRemove(map, gl) {
			gl.deleteBuffer(positionBuffer);
			gl.deleteBuffer(colorBuffer);
			gl.deleteProgram(program);
			flightPathElevationLayers.delete(map);
		}
	};
	return preview;
}

function ensureFlightPathDeckOverlay(map) {
	let overlay = flightPathDeckOverlays.get(map);
	if (overlay) return overlay;
	overlay = new MapboxOverlay({ interleaved: true, layers: [] });
	map.addControl(overlay);
	flightPathDeckOverlays.set(map, overlay);
	return overlay;
}

function syncFlightPathDeckOverlay(map, waypoints) {
	const overlay = ensureFlightPathDeckOverlay(map);
	const legs = waypoints.slice(0, -1).map((start, index) => {
		const end = waypoints[index + 1];
		return {
			color: deckColor(start),
			path: [
				[start.longitude, start.latitude, start.altitude],
				[end.longitude, end.latitude, end.altitude]
			]
		};
	});
	const guides = waypoints.map((waypoint) => ({
		path: [
			[waypoint.longitude, waypoint.latitude, terrainElevation(map, waypoint)],
			[waypoint.longitude, waypoint.latitude, waypoint.altitude]
		]
	}));
	overlay.setProps({
		layers: [
			new PathLayer({
				id: 'flight-path-elevated-legs',
				data: legs,
				getPath: (leg) => leg.path,
				getColor: (leg) => leg.color,
				getWidth: 3,
				widthUnits: 'pixels',
				capRounded: true,
				jointRounded: true,
				pickable: true
			}),
			new PathLayer({
				id: 'flight-path-elevated-guides',
				data: guides,
				getPath: (guide) => guide.path,
				getColor: [148, 163, 184, 150],
				getWidth: 2,
				widthUnits: 'pixels',
				pickable: false
			}),
			new ScatterplotLayer({
				id: 'flight-path-elevated-waypoints',
				data: waypoints,
				getPosition: (waypoint) => [waypoint.longitude, waypoint.latitude, waypoint.altitude],
				getRadius: 7,
				radiusUnits: 'pixels',
				radiusMinPixels: 7,
				stroked: true,
				getFillColor: (waypoint) => deckColor(waypoint),
				getLineColor: [255, 255, 255, 255],
				getLineWidth: 2,
				lineWidthUnits: 'pixels',
				billboard: true,
				pickable: true
			})
		]
	});
}

function addFlightPathLayers(map) {
	if (!map.getSource(FLIGHT_PATH_LEGS_SOURCE_ID))
		map.addSource(FLIGHT_PATH_LEGS_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
			lineMetrics: true
		});
	if (!map.getSource(FLIGHT_PATH_SHADOW_SOURCE_ID))
		map.addSource(FLIGHT_PATH_SHADOW_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION
		});
	if (!map.getSource(FLIGHT_PATH_GUIDES_SOURCE_ID))
		map.addSource(FLIGHT_PATH_GUIDES_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
			lineMetrics: true
		});
	if (!map.getSource(FLIGHT_PATH_WAYPOINTS_SOURCE_ID))
		map.addSource(FLIGHT_PATH_WAYPOINTS_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION
		});
	if (!map.getSource(FLIGHT_PATH_CAMERA_SOURCE_ID))
		map.addSource(FLIGHT_PATH_CAMERA_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION
		});
	if (!map.getSource(DETECTED_WALL_SOURCE_ID))
		map.addSource(DETECTED_WALL_SOURCE_ID, {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION
		});
	if (!map.getLayer('detected-wall-halo'))
		map.addLayer({
			id: 'detected-wall-halo',
			type: 'line',
			source: DETECTED_WALL_SOURCE_ID,
			filter: ['==', ['get', 'boundary'], 'base'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 }
		});
	if (!map.getLayer('detected-wall-line'))
		map.addLayer({
			id: 'detected-wall-line',
			type: 'line',
			source: DETECTED_WALL_SOURCE_ID,
			filter: ['==', ['get', 'boundary'], 'base'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#a855f7', 'line-width': 4, 'line-opacity': 0.95 }
		});
	if (!map.getLayer('detected-wall-top'))
		map.addLayer({
			id: 'detected-wall-top',
			type: 'line',
			source: DETECTED_WALL_SOURCE_ID,
			filter: ['==', ['get', 'boundary'], 'top'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': '#38bdf8',
				'line-width': 3,
				'line-opacity': 0.9,
				'line-dasharray': [2, 1]
			}
		});
	if (!map.getLayer('detected-wall-samples'))
		map.addLayer({
			id: 'detected-wall-samples',
			type: 'circle',
			source: DETECTED_WALL_SOURCE_ID,
			filter: ['==', ['get', 'feature'], 'detected-wall-sample'],
			paint: {
				'circle-radius': 3,
				'circle-color': '#facc15',
				'circle-stroke-width': 1.5,
				'circle-stroke-color': '#713f12'
			}
		});
	if (!map.getLayer('flight-path-ground-shadow'))
		map.addLayer({
			id: 'flight-path-ground-shadow',
			type: 'line',
			source: FLIGHT_PATH_SHADOW_SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#94a3b8', 'line-width': 2, 'line-opacity': 0.45 }
		});
	if (!map.getLayer('flight-path-line'))
		map.addLayer({
			id: 'flight-path-line',
			type: 'line',
			source: FLIGHT_PATH_LEGS_SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': ['get', 'color'],
				'line-width': 3,
				'line-opacity': 0.9,
				'line-dasharray': [2, 1.2]
			}
		});
	if (!map.getLayer('flight-path-vertical-guides'))
		map.addLayer({
			id: 'flight-path-vertical-guides',
			type: 'line',
			source: FLIGHT_PATH_GUIDES_SOURCE_ID,
			paint: {
				'line-color': '#94a3b8',
				'line-width': 2,
				'line-opacity': 0.55,
				'line-dasharray': [1, 1]
			}
		});
	if (!map.getLayer('flight-path-waypoints'))
		map.addLayer({
			id: 'flight-path-waypoints',
			type: 'circle',
			source: FLIGHT_PATH_WAYPOINTS_SOURCE_ID,
			paint: {
				'circle-radius': 5,
				'circle-color': ['get', 'color'],
				'circle-opacity': 0,
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
	if (!map.getLayer('flight-path-camera-view'))
		map.addLayer({
			id: 'flight-path-camera-view',
			type: 'line',
			source: FLIGHT_PATH_CAMERA_SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#facc15', 'line-width': 2, 'line-opacity': 0.9 }
		});
}

export function syncFlightPlanPreview(map, flightPlan) {
	if (!map) return;
	addFlightPathLayers(map);
	const { legs, shadow, guides, waypoints, camera } = buildFlightPathFeatureCollections(
		flightPlan,
		map
	);
	map.getSource(FLIGHT_PATH_LEGS_SOURCE_ID)?.setData(legs);
	map.getSource(FLIGHT_PATH_SHADOW_SOURCE_ID)?.setData(shadow);
	map.getSource(FLIGHT_PATH_GUIDES_SOURCE_ID)?.setData(guides);
	map.getSource(FLIGHT_PATH_WAYPOINTS_SOURCE_ID)?.setData(waypoints);
	map.getSource(FLIGHT_PATH_CAMERA_SOURCE_ID)?.setData(camera);
	map.getSource(DETECTED_WALL_SOURCE_ID)?.setData(detectedWallFeatureCollection(flightPlan));
	const elevatedWaypoints = flightPlanWaypoints(flightPlan, map);
	syncFlightPathDeckOverlay(map, elevatedWaypoints);
}

export function ensureCragEditorLayers(map) {
	const detectionRadius = getMapHitRadius(12);
	const drawingPointRadius = getTouchTargetSize(5);
	const midpointRadius = getTouchTargetSize(5);
	const vertexRadius = getTouchTargetSize(7);
	const deleteTextSize = getTouchTargetSize(17);

	if (!map.getSource('maptiler_planet'))
		map.addSource('maptiler_planet', {
			type: 'vector',
			url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=ic9EbrsUoaMeSBLjjuEO'
		});
	if (!map.getLayer('snap-helper'))
		map.addLayer({
			id: 'snap-helper',
			type: 'line',
			source: 'maptiler_planet',
			'source-layer': 'transportation',
			paint: { 'line-opacity': 0 },
			layout: { visibility: 'visible' }
		});
	if (!map.getSource('detection-highlights'))
		map.addSource('detection-highlights', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
	if (!map.getLayer('detection-points'))
		map.addLayer({
			id: 'detection-points',
			type: 'circle',
			source: 'detection-highlights',
			paint: {
				'circle-radius': detectionRadius,
				'circle-color': '#0075de',
				'circle-opacity': 0.3,
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de',
				'circle-stroke-opacity': 0.7
			}
		});

	if (!map.getSource('crag-editor-data'))
		map.addSource('crag-editor-data', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
	if (!map.getLayer('tracks-line-saved'))
		map.addLayer({
			id: 'tracks-line-saved',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'state'], 'saved'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
				'line-width': ['case', ['==', ['get', 'selected'], true], 6, 4]
			}
		});
	if (!map.getLayer('tracks-line-drawing'))
		map.addLayer({
			id: 'tracks-line-drawing',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'state'], 'drawing'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': '#0075de', 'line-width': 3, 'line-dasharray': [2, 1] }
		});
	if (!map.getLayer('routes-line'))
		map.addLayer({
			id: 'routes-line',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'route'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
				'line-width': ['case', ['==', ['get', 'selected'], true], 6, 4],
				'line-opacity': 0.9
			}
		});
	if (!map.getLayer('tracks-points-drawing'))
		map.addLayer({
			id: 'tracks-points-drawing',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'track-vertex'],
			paint: {
				'circle-radius': drawingPointRadius,
				'circle-color': '#ffffff',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de'
			}
		});
	if (!map.getLayer('tracks-point-midpoints'))
		map.addLayer({
			id: 'tracks-point-midpoints',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'track-midpoint'],
			paint: {
				'circle-radius': 5,
				'circle-color': '#f59e0b',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
	if (!map.getLayer('tracks-point-delete'))
		map.addLayer({
			id: 'tracks-point-delete',
			type: 'symbol',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'track-vertex-delete'],
			layout: {
				'text-field': '×',
				'text-font': ['Noto Sans Bold'],
				'text-size': deleteTextSize,
				'text-offset': [0.85, -0.85],
				'text-allow-overlap': true,
				'text-ignore-placement': true
			},
			paint: { 'text-color': '#ffffff', 'text-halo-color': '#dc2626', 'text-halo-width': 6 }
		});
	if (!map.getSource('tracks-drag-overlay'))
		map.addSource('tracks-drag-overlay', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
	if (!map.getLayer('tracks-drag-lines'))
		map.addLayer({
			id: 'tracks-drag-lines',
			type: 'line',
			source: 'tracks-drag-overlay',
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: { 'line-color': '#0075de', 'line-width': 4, 'line-opacity': 1 }
		});
	if (!map.getLayer('tracks-drag-point'))
		map.addLayer({
			id: 'tracks-drag-point',
			type: 'circle',
			source: 'tracks-drag-overlay',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-radius': drawingPointRadius,
				'circle-color': '#0075de',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
	if (!map.getSource('track-cut-overlay'))
		map.addSource('track-cut-overlay', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
	if (!map.getLayer('track-cut-line'))
		map.addLayer({
			id: 'track-cut-line',
			type: 'line',
			source: 'track-cut-overlay',
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: { 'line-color': '#dc2626', 'line-width': 3, 'line-dasharray': [2, 1] }
		});
	if (!map.getLayer('track-cut-points'))
		map.addLayer({
			id: 'track-cut-points',
			type: 'circle',
			source: 'track-cut-overlay',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'intersection'], true], 7, 5],
				'circle-color': ['case', ['==', ['get', 'intersection'], true], '#facc15', '#dc2626'],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
	if (!map.getLayer('sector-polygons-fill'))
		map.addLayer(
			{
				id: 'sector-polygons-fill',
				type: 'fill',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'feature'], 'sector'],
				paint: {
					'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
				}
			},
			'tracks-line-saved'
		);
	if (!map.getLayer('sector-polygons-outline'))
		map.addLayer(
			{
				id: 'sector-polygons-outline',
				type: 'line',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'feature'], 'sector'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: {
					'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'line-width': ['case', ['==', ['get', 'selected'], true], 3, 2],
					'line-opacity': 0.9
				}
			},
			'tracks-line-saved'
		);
	if (!map.getLayer('sector-vertex-midpoints'))
		map.addLayer({
			id: 'sector-vertex-midpoints',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'sector-midpoint'],
			paint: {
				'circle-radius': midpointRadius,
				'circle-color': '#ffffff',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de',
				'circle-opacity': 0.85
			}
		});
	if (!map.getLayer('sector-vertices'))
		map.addLayer({
			id: 'sector-vertices',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'sector-vertex'],
			paint: {
				'circle-radius': vertexRadius,
				'circle-color': '#0075de',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
	if (!map.getLayer('sector-vertex-delete'))
		map.addLayer({
			id: 'sector-vertex-delete',
			type: 'symbol',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'sector-vertex-delete'],
			layout: {
				'text-field': '×',
				'text-font': ['Noto Sans Bold'],
				'text-size': deleteTextSize,
				'text-offset': [0.85, -0.85],
				'text-allow-overlap': true,
				'text-ignore-placement': true
			},
			paint: { 'text-color': '#ffffff', 'text-halo-color': '#dc2626', 'text-halo-width': 6 }
		});

	addFlightPathLayers(map);
	ensureFlightPathDeckOverlay(map);
}

export function buildEditorFeatureCollection({
	sectors = [],
	savedAccessFeatures = [],
	routes = [],
	selectedObject = null,
	editingRoutePath = null,
	drawingPoints = [],
	visibleDrawingPointIndexes = [],
	editingDrawingPath = false,
	selectedTrackPointIndex = null,
	draggingTrackPointIndex = null,
	selectedSectorVertex = null,
	editingTrackIndex = null,
	flightPlan = null
}) {
	const features = [];
	sectors.forEach((sector) => {
		if (sector.geometry?.type !== 'Polygon') return;
		const isSelected = selectedObject?.type === 'sector' && selectedObject.id === sector.id;
		features.push({
			type: 'Feature',
			geometry: sector.geometry,
			properties: {
				feature: 'sector',
				id: sector.id || '',
				name: sector.name || '',
				selected: isSelected
			}
		});
		if (!isSelected) return;
		const path = getGeometryPath(sector.geometry);
		const editablePath = getEditablePath(path, { closed: true });
		editablePath.forEach((point, vertexIndex) => {
			const isSelectedVertex =
				selectedSectorVertex?.sectorId === sector.id &&
				selectedSectorVertex?.vertexIndex === vertexIndex;
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: point },
				properties: { feature: 'sector-vertex', sectorId: sector.id, vertexIndex }
			});
			if (isSelectedVertex && editablePath.length > 3)
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: point },
					properties: { feature: 'sector-vertex-delete', sectorId: sector.id, vertexIndex }
				});
		});
		getPathMidpoints(path, { closed: true }).forEach((midpoint) => {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: midpoint.point },
				properties: {
					feature: 'sector-midpoint',
					sectorId: sector.id,
					insertIndex: midpoint.insertIndex
				}
			});
		});
	});
	savedAccessFeatures
		.filter((feature) => feature.properties?.kind === 'approach')
		.forEach((track) => {
			if (editingTrackIndex === track.id || !(track.geometry?.coordinates?.length > 1)) return;
			features.push({
				type: 'Feature',
				geometry: track.geometry,
				properties: {
					...track.properties,
					state: 'saved',
					accessFeatureId: track.id,
					selected: selectedObject?.type === 'approach' && track.id === selectedObject.id
				}
			});
		});
	routes.forEach(({ key, route }) => {
		for (const [pathIndex, path] of (route?.assets?.paths || []).entries()) {
			if (editingRoutePath?.key === key && editingRoutePath?.pathIndex === pathIndex) continue;
			if (path?.path?.type !== 'LineString' || path.path.coordinates?.length < 2) continue;
			features.push({
				type: 'Feature',
				geometry: path.path,
				properties: {
					feature: 'route',
					key,
					documentPath: key.slice(0, key.lastIndexOf(':')),
					routeId: route.id,
					pathIndex,
					name: route.name || 'Unnamed route',
					selected: selectedObject?.type === 'route' && key === selectedObject.key
				}
			});
		}
	});
	const drawingSegments =
		draggingTrackPointIndex === null
			? [drawingPoints]
			: [
					drawingPoints.slice(0, draggingTrackPointIndex),
					drawingPoints.slice(draggingTrackPointIndex + 1)
				];
	for (const coordinates of drawingSegments) {
		if (coordinates.length < 2) continue;
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates },
			properties: { name: 'Drawing', state: 'drawing' }
		});
	}
	for (const pointIndex of visibleDrawingPointIndexes) {
		if (pointIndex === draggingTrackPointIndex || !drawingPoints[pointIndex]) continue;
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: drawingPoints[pointIndex] },
			properties: { feature: 'track-vertex', type: 'Point', state: 'drawing', pointIndex }
		});
	}
	if (editingDrawingPath && drawingPoints.length > 1) {
		for (let index = 0; index < drawingPoints.length - 1; index += 1) {
			const first = drawingPoints[index];
			const second = drawingPoints[index + 1];
			features.push({
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]
				},
				properties: {
					feature: 'track-midpoint',
					type: 'Point',
					state: 'drawing',
					pointIndex: index + 1
				}
			});
		}
		if (
			selectedTrackPointIndex !== null &&
			drawingPoints.length > 2 &&
			drawingPoints[selectedTrackPointIndex]
		) {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: drawingPoints[selectedTrackPointIndex] },
				properties: {
					feature: 'track-vertex-delete',
					type: 'Point',
					state: 'drawing',
					pointIndex: selectedTrackPointIndex
				}
			});
		}
	}
	return { type: 'FeatureCollection', features };
}

import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

export function fitCoordinatesBounds(map, coordinates = [], options = {}) {
	if (!map || coordinates.length === 0) return;
	const bounds = coordinates.reduce(
		(bounds, coordinate) => bounds.extend(coordinate),
		new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
	);
	map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 500, ...options });
}

export function reverseCoordinates(coordinates = []) {
	return [...coordinates].reverse();
}

export function trimCoordinatesStart(coordinates = [], index = 0) {
	return coordinates.slice(Math.max(0, index));
}

export function trimCoordinatesEnd(coordinates = [], count = 0) {
	return coordinates.slice(0, Math.max(0, coordinates.length - count));
}

export function splitCoordinatesAt(coordinates = [], index = 0) {
	const cutIndex = Math.max(0, Math.min(coordinates.length - 1, index));
	return [coordinates.slice(0, cutIndex + 1), coordinates.slice(cutIndex)];
}

export function distanceBetweenCoordinates(a, b) {
	if (!a || !b) return Infinity;
	const dx = a[0] - b[0];
	const dy = a[1] - b[1];
	return Math.sqrt(dx * dx + dy * dy);
}

export function joinByNearestEndpoints(a = [], b = []) {
	if (a.length === 0) return [...b];
	if (b.length === 0) return [...a];

	const candidates = [
		{ distance: distanceBetweenCoordinates(a.at(-1), b[0]), coordinates: [...a, ...b] },
		{
			distance: distanceBetweenCoordinates(a.at(-1), b.at(-1)),
			coordinates: [...a, ...reverseCoordinates(b)]
		},
		{
			distance: distanceBetweenCoordinates(a[0], b[0]),
			coordinates: [...reverseCoordinates(a), ...b]
		},
		{ distance: distanceBetweenCoordinates(a[0], b.at(-1)), coordinates: [...b, ...a] }
	];
	return candidates.sort((left, right) => left.distance - right.distance)[0].coordinates;
}

export function simplifyTrackCoordinates(coordinates = [], toleranceMeters = 10) {
	if (!Array.isArray(coordinates) || coordinates.length <= 2) return [...coordinates];
	if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0) return [...coordinates];

	const feature = {
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'LineString',
			coordinates
		}
	};
	const mercator = turf.toMercator(feature);
	const simplifiedMercator = turf.simplify(mercator, {
		tolerance: toleranceMeters,
		highQuality: true,
		mutate: false
	});
	const simplified = turf.toWgs84(simplifiedMercator)?.geometry?.coordinates || [];
	return simplified.length >= 2 ? simplified : [...coordinates];
}

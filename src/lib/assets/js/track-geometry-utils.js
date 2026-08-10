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

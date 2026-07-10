export function parseGpx(text) {
	const parser = new DOMParser();
	const xml = parser.parseFromString(text, 'text/xml');
	if (xml.querySelector('parsererror')) throw new Error('Invalid GPX file.');

	let points = Array.from(xml.querySelectorAll('trkpt'));
	if (points.length === 0) points = Array.from(xml.querySelectorAll('rtept'));
	if (points.length === 0) points = Array.from(xml.querySelectorAll('wpt'));

	return points
		.map((point) => [parseFloat(point.getAttribute('lon')), parseFloat(point.getAttribute('lat'))])
		.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function cloneCoordinates(coordinates = []) {
	return coordinates.map((point) => [Number(point?.[0]), Number(point?.[1])]);
}

export function coordinatesToPathGeoJson(coordinates = []) {
	return {
		type: 'LineString',
		coordinates: cloneCoordinates(coordinates).filter(
			(point) => Number.isFinite(point[0]) && Number.isFinite(point[1])
		)
	};
}

export function pathGeoJsonToCoordinates(path) {
	if (!path || path.type !== 'LineString' || !Array.isArray(path.coordinates)) return [];
	return cloneCoordinates(path.coordinates).filter(
		(point) => Number.isFinite(point[0]) && Number.isFinite(point[1])
	);
}

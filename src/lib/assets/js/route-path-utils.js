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

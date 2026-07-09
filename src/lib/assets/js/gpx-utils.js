import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';

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


export function gpxXmlFromCoordinates(name, coordinates = []) {
	const escapedName = String(name || 'Track')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
	const points = coordinates
		.map(([lon, lat]) => `\t\t\t<trkpt lat="${lat}" lon="${lon}"></trkpt>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Felsstudio" xmlns="http://www.topografix.com/GPX/1/1">\n\t<trk>\n\t\t<name>${escapedName}</name>\n\t\t<trkseg>\n${points}\n\t\t</trkseg>\n\t</trk>\n</gpx>\n`;
}

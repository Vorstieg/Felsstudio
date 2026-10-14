import type { Point2D } from '@vorstieg/fels-types/types';

export type GpxSegment = { name: string; points: Point2D[] };

/** Keep GPX segment boundaries: separate recordings must never acquire connecting edges. */
export function parseGpxSegments(text: string): GpxSegment[] {
	const xml = new DOMParser().parseFromString(text, 'text/xml');
	if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'gpx')
		throw new Error('Invalid GPX file.');
	const read = (element: Element, tag: string): Point2D[] =>
		Array.from(element.getElementsByTagNameNS('*', tag)).map((point) => {
			const lng = Number(point.getAttribute('lon') ?? NaN);
			const lat = Number(point.getAttribute('lat') ?? NaN);
			if (
				!Number.isFinite(lng) ||
				!Number.isFinite(lat) ||
				Math.abs(lng) > 180 ||
				Math.abs(lat) > 90
			)
				throw new Error('Invalid GPX coordinates.');
			return [lng, lat] as Point2D;
		});
	const segments: GpxSegment[] = [];
	for (const [trackIndex, track] of Array.from(xml.getElementsByTagNameNS('*', 'trk')).entries()) {
		const name =
			Array.from(track.children).find((child) => child.localName === 'name')?.textContent ||
			`Track ${trackIndex + 1}`;
		for (const [index, segment] of Array.from(
			track.getElementsByTagNameNS('*', 'trkseg')
		).entries()) {
			const points = read(segment, 'trkpt');
			if (points.length >= 2) segments.push({ name: `${name} · ${index + 1}`, points });
		}
	}
	if (!segments.length) {
		for (const [index, route] of Array.from(xml.getElementsByTagNameNS('*', 'rte')).entries()) {
			const points = read(route, 'rtept');
			if (points.length >= 2) segments.push({ name: `Route ${index + 1}`, points });
		}
	}
	if (!segments.length) throw new Error('GPX needs at least two track or route points.');
	return segments;
}

export function parseGpx(text: string): Point2D[] {
	return parseGpxSegments(text)[0].points;
}

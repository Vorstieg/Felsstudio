import { expect, it } from 'vitest';
import { parseGpxSegments } from './route-path-utils.ts';

it('keeps track and segment boundaries, including namespaced GPX', () => {
	const segments = parseGpxSegments(
		'<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Trail</name><trkseg><trkpt lon="16" lat="48"/><trkpt lon="16.1" lat="48.1"/></trkseg><trkseg><trkpt lon="17" lat="49"/><trkpt lon="17.1" lat="49.1"/></trkseg></trk></gpx>'
	);
	expect(segments).toHaveLength(2);
	expect(segments[0].name).toContain('Trail');
	expect(segments[0].points).toEqual([
		[16, 48],
		[16.1, 48.1]
	]);
	expect(segments[1].points).toEqual([
		[17, 49],
		[17.1, 49.1]
	]);
});
it('reads route points without connecting different routes', () => {
	expect(
		parseGpxSegments(
			'<gpx><rte><rtept lon="1" lat="1"/><rtept lon="2" lat="2"/></rte><rte><rtept lon="3" lat="3"/><rtept lon="4" lat="4"/></rte></gpx>'
		)
	).toHaveLength(2);
});
it.each([
	'<gpx>',
	'<html/>',
	'<gpx/>',
	'<gpx><trk><trkseg><trkpt lon="181" lat="48"/><trkpt lon="16" lat="48"/></trkseg></trk></gpx>',
	'<gpx><trk><trkseg><trkpt lat="48"/><trkpt lon="16" lat="48"/></trkseg></trk></gpx>'
])('rejects malformed, empty or invalid coordinates: %s', (text) => {
	expect(() => parseGpxSegments(text)).toThrow();
});

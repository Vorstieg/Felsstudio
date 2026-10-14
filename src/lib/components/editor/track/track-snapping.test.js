// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { nearestWayPoint, snapToNearestWay, TRACK_SNAP_LAYER_ID } from './track-snapping.ts';

const line = (coordinates) => ({ geometry: { type: 'LineString', coordinates } });
const original = [0, 0.0001];
const screenPoint = { x: 100, y: 200 };

describe('way snapping geometry', () => {
	it('selects the closest way regardless of feature order', () => {
		const near = line([
			[-0.001, 0],
			[0.001, 0]
		]);
		const far = line([
			[-0.001, 0.001],
			[0.001, 0.001]
		]);
		for (const features of [
			[far, near],
			[near, far]
		]) {
			const result = nearestWayPoint(original, features);
			expect(result[0]).toBeCloseTo(0, 8);
			expect(result[1]).toBeCloseTo(0, 8);
		}
	});
	it('checks every part of a MultiLineString', () => {
		const result = nearestWayPoint(original, [
			{
				geometry: {
					type: 'MultiLineString',
					coordinates: [
						[
							[-0.001, 0.002],
							[0.001, 0.002]
						],
						[
							[-0.001, 0],
							[0.001, 0]
						]
					]
				}
			}
		]);
		expect(result[0]).toBeCloseTo(0, 8);
		expect(result[1]).toBeCloseTo(0, 8);
	});
	it('snaps to an endpoint when the click lies beyond the end of a way', () => {
		expect(
			nearestWayPoint(
				[0.002, 0],
				[
					line([
						[0, 0],
						[0.001, 0]
					])
				]
			)
		).toEqual([0.001, 0]);
	});
	it('leaves the clicked position intact for empty, non-line, or unusable geometry', () => {
		const features = [
			{ geometry: null },
			{ geometry: { type: 'Point', coordinates: [0, 0] } },
			{
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[-1, 0],
							[1, 0],
							[0, 1],
							[-1, 0]
						]
					]
				}
			},
			line([]),
			line([[0, 0]]),
			line([
				[NaN, 0],
				[1, 0]
			]),
			line([[0], [1]])
		];
		expect(nearestWayPoint(original, [])).toBe(original);
		expect(nearestWayPoint(original, features)).toBe(original);
	});
	it('preserves the clicked position and recorded coordinates, including altitude', () => {
		const coordinates = [
			[-0.001, 0, 800],
			[0.001, 0, 900]
		];
		nearestWayPoint(original, [line(coordinates)]);
		expect(original).toEqual([0, 0.0001]);
		expect(coordinates).toEqual([
			[-0.001, 0, 800],
			[0.001, 0, 900]
		]);
	});
});

describe('map snapping integration', () => {
	it('falls back without querying when the map or eligible layers are unavailable', () => {
		expect(snapToNearestWay(null, screenPoint, original)).toBe(original);
		const map = { getLayer: () => undefined, queryRenderedFeatures: vi.fn() };
		expect(snapToNearestWay(map, screenPoint, original)).toBe(original);
		expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
	});
	it('queries existing way layers near the click and snaps to their geometry', () => {
		const map = {
			getLayer: (id) => (['Path', TRACK_SNAP_LAYER_ID].includes(id) ? {} : undefined),
			queryRenderedFeatures: vi.fn(() => [
				line([
					[-0.001, 0],
					[0.001, 0]
				])
			])
		};
		const result = snapToNearestWay(map, screenPoint, original);
		expect(map.queryRenderedFeatures).toHaveBeenCalledWith(
			[
				[80, 180],
				[120, 220]
			],
			{ layers: ['Path', TRACK_SNAP_LAYER_ID] }
		);
		expect(result[1]).toBeCloseTo(0, 8);
	});
	it('allows a map style to supply its own way layer names', () => {
		const map = {
			getLayer: (id) => (id === 'custom-walking-paths' ? {} : undefined),
			queryRenderedFeatures: vi.fn(() => [])
		};
		expect(
			snapToNearestWay(map, screenPoint, original, {
				layerIds: ['custom-walking-paths'],
				radiusPx: 10
			})
		).toBe(original);
		expect(map.queryRenderedFeatures).toHaveBeenCalledWith(
			[
				[90, 190],
				[110, 210]
			],
			{ layers: ['custom-walking-paths'] }
		);
	});
});

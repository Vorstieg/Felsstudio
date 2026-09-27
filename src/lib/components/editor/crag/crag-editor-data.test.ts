import { describe, expect, it } from 'vitest';
import { buildEditorFeatureCollection } from './crag-editor-data.ts';
import type { PathFeature } from '@vorstieg/fels-types/types';

const path = {
	type: 'Feature',
	id: 'path-1',
	properties: { name: 'North face' },
	geometry: {
		type: 'LineString',
		coordinates: [
			[16, 48, 0],
			[16.1, 48.1, 0]
		]
	}
} satisfies PathFeature;

describe('buildEditorFeatureCollection', () => {
	it('marks a saved route path selected and exposes its route IDs', () => {
		const result = buildEditorFeatureCollection({
			routePaths: [
				{
					documentPath: 'crag/topo.json',
					pathIndex: 0,
					feature: path,
					assignedRouteIds: ['route-1']
				}
			],
			selectedObject: { type: 'route-path', documentPath: 'crag/topo.json', pathId: 'path-1' }
		});
		expect(result.features[0].properties).toMatchObject({
			feature: 'route-path',
			selected: true,
			assignedRouteIds: ['route-1'],
			name: 'North face'
		});
	});

	it('omits the path being edited and shows its drawing vertices', () => {
		const result = buildEditorFeatureCollection({
			routePaths: [{ documentPath: 'crag/topo.json', pathIndex: 0, feature: path }],
			editingRoutePath: { documentPath: 'crag/topo.json', pathId: 'path-1' },
			drawingPoints: [
				[16, 48],
				[16.1, 48.1],
				[16.2, 48.2]
			],
			visibleDrawingPointIndexes: [0, 1, 2],
			selectedTrackPointIndexes: [1],
			editingDrawingPath: true
		});
		expect(result.features.some((feature) => feature.properties?.feature === 'route-path')).toBe(
			false
		);
		expect(
			result.features.filter((feature) => feature.properties?.feature === 'track-vertex')
		).toHaveLength(3);
		expect(
			result.features.find(
				(feature) =>
					feature.properties?.pointIndex === 1 && feature.properties?.feature === 'track-vertex'
			)?.properties?.selected
		).toBe(true);
	});
});

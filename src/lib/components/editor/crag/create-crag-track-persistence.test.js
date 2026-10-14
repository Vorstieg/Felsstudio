import { describe, expect, it } from 'vitest';
import { createCragEditorSession, createFelsEntry } from '$lib/state/crag-session.svelte.ts';
import { createCragTrackPersistence } from './create-crag-track-persistence.ts';

function fixture() {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		childEntries: [],
		dirtyPaths: [],
		removedPaths: [],
		images: [],
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'approach',
					properties: { kind: 'approach' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[16, 48],
							[16.1, 48.1]
						]
					}
				}
			]
		},
		topo: {
			id: 'wall',
			routes: [],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 12,
						properties: { name: 'Topo path' },
						geometry: {
							type: 'LineString',
							coordinates: [
								[16, 48, 800],
								[16.1, 48.1, 900]
							]
						}
					}
				]
			}
		}
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	return { state, persistence: createCragTrackPersistence(state) };
}
describe('track persistence contract', () => {
	it('rejects missing targets, incompatible joins, and route writes without an adapter', () => {
		const { state, persistence } = fixture();
		const route = { kind: 'route-path', documentPath: 'crags/wall/wall-topo.json', pathId: '12' };
		const approach = { kind: 'access', featureId: 'approach' };
		expect(
			persistence.save({
				target: { kind: 'access', featureId: 'missing' },
				segments: [
					[
						[16, 48],
						[16.1, 48.1]
					]
				],
				name: 'Missing'
			})
		).toBe(false);
		expect(
			persistence.save({
				target: route,
				segments: [
					[
						[16, 48],
						[16.1, 48.1]
					]
				],
				name: 'Path'
			})
		).toBe(false);
		expect(
			persistence.join({
				base: approach,
				candidate: route,
				points: [
					[16, 48],
					[16.1, 48.1]
				],
				name: 'Invalid join'
			})
		).toBe(false);
		expect(
			persistence.join({
				base: approach,
				candidate: approach,
				points: [
					[16, 48],
					[16.1, 48.1]
				],
				name: 'Self join'
			})
		).toBe(false);
		expect(persistence.remove({ kind: 'access', featureId: 'missing' })).toBe(false);
		expect(state.history.entries).toHaveLength(0);
		expect(state.workspace.access.features).toHaveLength(1);
		expect(state.workspace.topo.paths.features).toHaveLength(1);
	});
	it('resolves numeric topo path IDs without modifying stored altitude coordinates', () => {
		const { state, persistence } = fixture();
		const path = persistence.get({
			kind: 'route-path',
			documentPath: 'crags/wall/wall-topo.json',
			pathId: '12'
		});
		expect(path.id).toBe('12');
		expect(path.geometry.coordinates).toEqual([
			[16, 48, 800],
			[16.1, 48.1, 900]
		]);
		path.geometry.coordinates[0][0] = 10;
		expect(state.workspace.topo.paths.features[0].geometry.coordinates[0]).toEqual([16, 48, 800]);
	});
});

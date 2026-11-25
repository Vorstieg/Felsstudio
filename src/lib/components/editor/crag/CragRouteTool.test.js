// @vitest-environment node
import { expect, test } from 'vitest';
import { createCragEditorSession, createFelsEntry } from '$lib/state/crag-session.svelte.ts';
import { createCragRouteTool } from './CragRouteTool.svelte.ts';

test('adds a route to the active workspace topo document', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: null,
		access: null,
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	let selection = null;
	const tool = createCragRouteTool({
		state,
		getSelection: () => selection,
		selectObject: (value) => (selection = value),
		getRouteDraft: () => null,
		cancelTrackEdit: () => {},
		startRouteDraft: () => {},
		startRoutingDraft: () => {},
		editRoutePathTrack: () => {},
		setActiveTool: () => {}
	});
	tool.addRoute();
	expect(state.getActiveWorkspaceEntry().topo.routes).toHaveLength(1);
	expect(state.getActiveWorkspaceEntry().dirtyPaths).toContain('crags/wall/wall-topo.json');
});

test('moving an approach track to topo paths is one undoable edit', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: { id: 'wall', routes: [], paths: { type: 'FeatureCollection', features: [] } },
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'approach-1',
					properties: { kind: 'approach' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[1, 1]
						]
					}
				}
			]
		},
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	const tool = createCragRouteTool({
		state,
		getSelection: () => null,
		selectObject: () => {}
	});
	expect(tool.moveApproachTrackToTopoPaths('crags/wall/wall-topo.json', 'approach-1')).toBe(true);
	expect(state.history.entries).toHaveLength(1);
	expect(state.workspace.topo.paths.features).toHaveLength(1);
	expect(state.workspace.access.features).toHaveLength(0);
	expect(state.workspace.dirtyPaths).toEqual(
		expect.arrayContaining(['crags/wall/wall-topo.json', 'crags/wall/wall-access.json'])
	);
	expect(state.undo()).toBe(true);
	expect(state.workspace.topo.paths.features).toHaveLength(0);
	expect(state.workspace.access.features).toHaveLength(1);
	expect(state.undo()).toBe(false);
});

test('a new path stays outside the document until Finish, then creates one undo step', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: {
			id: 'wall',
			routes: [{ id: 'route-1', pathRefs: [] }],
			paths: { type: 'FeatureCollection', features: [] }
		},
		access: null,
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	let target;
	const tool = createCragRouteTool({
		state,
		startRouteDraft: (value) => {
			target = value;
		},
		startRoutingDraft: () => {}
	});
	tool.addRoutePath('crags/wall/wall-topo.json', 'route-1');
	expect(state.history.entries).toHaveLength(0);
	expect(state.workspace.topo.paths.features).toHaveLength(0);
	expect(state.workspace.topo.routes[0].pathRefs).toHaveLength(0);
	expect(
		tool.saveRouteSegments(target, [
			[
				[16, 48],
				[16.001, 48.001]
			]
		])
	).toBe(true);
	expect(state.history.entries).toHaveLength(1);
	expect(state.workspace.topo.paths.features).toHaveLength(1);
	expect(state.workspace.topo.routes[0].pathRefs).toHaveLength(1);
	expect(state.undo()).toBe(true);
	expect(state.workspace.topo.paths.features).toHaveLength(0);
	expect(state.workspace.topo.routes[0].pathRefs).toEqual([]);
});

test('assigning, copying, and deleting route paths each create one undo step', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: {
			id: 'wall',
			routes: [{ id: 'route-1', pathRefs: [] }],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'path-1',
						properties: {},
						geometry: {
							type: 'LineString',
							coordinates: [
								[0, 0],
								[1, 1]
							]
						}
					}
				]
			}
		},
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'approach-1',
					properties: { kind: 'approach' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[2, 2]
						]
					}
				}
			]
		},
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	const tool = createCragRouteTool({ state, getRouteDraft: () => null, getSelection: () => null });
	const path = 'crags/wall/wall-topo.json';
	expect(tool.assignExistingRoutePath(path, 'route-1', 'path-1')).toBe(true);
	expect(state.history.entries).toHaveLength(1);
	expect(tool.assignExistingRoutePath(path, 'route-1', 'path-1')).toBe(false);
	expect(state.history.entries).toHaveLength(1);
	expect(state.undo()).toBe(true);
	expect(state.workspace.topo.routes[0].pathRefs).toEqual([]);

	expect(tool.createRoutePathFromAccess(path, 'route-1', 'approach-1')).toBe(true);
	expect(state.history.entries).toHaveLength(1);
	expect(state.workspace.topo.paths.features).toHaveLength(2);
	expect(state.undo()).toBe(true);
	expect(state.workspace.topo.paths.features).toHaveLength(1);

	expect(tool.deleteRoutePath(path, 'path-1')).toBe(true);
	expect(state.history.entries).toHaveLength(1);
	expect(state.workspace.topo.paths.features).toHaveLength(0);
	expect(state.undo()).toBe(true);
	expect(state.workspace.topo.paths.features).toHaveLength(1);
});

test('updates route, path reference, and path feature through typed patches', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: {
			id: 'wall',
			routes: [{ id: 'route-1', name: 'Old', pathRefs: [{ pathId: 'path-1', role: 'main' }] }],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'path-1',
						properties: { name: 'Old path' },
						geometry: {
							type: 'LineString',
							coordinates: [
								[0, 0],
								[1, 1]
							]
						}
					}
				]
			}
		},
		access: null,
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	const tool = createCragRouteTool({ state });
	const path = 'crags/wall/wall-topo.json';
	tool.updateRoute(path, 'route-1', { name: 'New' });
	tool.updateRoutePath(path, 'route-1', 'path-1', { label: 'North' });
	tool.updateRoutePathFeature(path, 'path-1', { name: 'New path', description: '' });
	const topo = state.getActiveWorkspaceEntry().topo;
	expect(topo.routes[0].name).toBe('New');
	expect(topo.routes[0].pathRefs[0].label).toBe('North');
	expect(topo.paths.features[0].properties).toEqual({ name: 'New path' });
});

test('assignPathToAllRoutes, assignAccessTrackToRoutes, and saveTrackAsRoutePaths assign cleanly without duplicating path names into label', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: {
			id: 'wall',
			routes: [
				{ id: 'route-1', name: 'Sonnenriss', pathRefs: [{ pathId: 'path-1', role: 'approach' }] },
				{ id: 'route-2', name: 'Kante direkt', pathRefs: [] },
				{ id: 'route-3', name: 'Abendlicht', pathRefs: [] }
			],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'path-1',
						properties: { name: 'Zustieg Südwand' },
						geometry: {
							type: 'LineString',
							coordinates: [
								[0, 0],
								[1, 1]
							]
						}
					}
				]
			}
		},
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'approach-1',
					properties: { kind: 'approach', name: 'Parkplatz Zustieg' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[2, 2]
						]
					}
				}
			]
		},
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	const tool = createCragRouteTool({ state, getSelection: () => null, selectObject: () => {} });
	const path = 'crags/wall/wall-topo.json';

	// Bulk-assign existing topo path to remaining unassigned routes in one undoable commit
	expect(tool.assignPathToAllRoutes(path, 'path-1', 'approach')).toBe(true);
	expect(state.workspace.topo.routes.map((r) => r.pathRefs.length)).toEqual([1, 1, 1]);
	expect(state.workspace.topo.routes[1].pathRefs[0]).toEqual({
		pathId: 'path-1',
		role: 'approach'
	});
	expect(tool.assignPathToAllRoutes(path, 'path-1', 'approach')).toBe(false);

	// Convert approach track and assign to all routes in one undoable commit
	expect(tool.assignAccessTrackToRoutes(path, 'approach-1', 'all', 'approach')).toBe(true);
	expect(state.workspace.access.features).toHaveLength(0);
	expect(state.workspace.topo.paths.features).toHaveLength(2);
	expect(state.workspace.topo.routes.every((r) => r.pathRefs.length === 2)).toBe(true);
	expect(state.workspace.topo.routes[0].pathRefs[1].label).toBeUndefined();

	// Save a GPX track to all routes without duplicating name into ref.label
	expect(
		tool.saveTrackAsRoutePaths(path, 'all', {
			coordinates: [
				[16, 48],
				[16.01, 48.01]
			],
			name: 'Abseilpiste Nord',
			role: 'descent'
		})
	).toBe(true);
	const descentFeature = state.workspace.topo.paths.features.at(-1);
	expect(descentFeature.properties.name).toBe('Abseilpiste Nord');
	expect(state.workspace.topo.routes.every((r) => r.pathRefs.at(-1).role === 'descent')).toBe(true);
	expect(state.workspace.topo.routes.every((r) => r.pathRefs.at(-1).label === undefined)).toBe(
		true
	);

	// Convert a topo path back into a whole-crag approach and duplicate it, both undoable
	expect(tool.moveTopoPathToCragApproach(path, descentFeature.id)).toBe(true);
	expect(state.workspace.access.features).toHaveLength(1);
	expect(state.workspace.access.features[0].properties.name).toBe('Abseilpiste Nord');
	expect(
		state.workspace.topo.paths.features.some((f) => String(f.id) === String(descentFeature.id))
	).toBe(false);
	expect(
		state.workspace.topo.routes.every(
			(r) => !r.pathRefs.some((ref) => String(ref.pathId) === String(descentFeature.id))
		)
	).toBe(true);

	const approachId = state.workspace.access.features[0].id;
	expect(tool.duplicateApproachTrack(approachId)).toBe(true);
	expect(state.workspace.access.features).toHaveLength(2);
	expect(state.workspace.access.features[1].properties.name).toBe('Abseilpiste Nord copy');
});

test('assignAccessTrackToAllRoutes spans multiple sectors and saveTrackAsRoutePaths preserves split tails', () => {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		topo: {
			id: 'wall',
			routes: [{ id: 'route-1', name: 'Main Route', pathRefs: [] }],
			paths: { type: 'FeatureCollection', features: [] }
		},
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'approach-shared',
					properties: {
						kind: 'approach',
						name: 'Shared Approach',
						description: 'From main car park'
					},
					geometry: {
						type: 'LineString',
						coordinates: [
							[16, 48],
							[16.01, 48.01]
						]
					}
				}
			]
		},
		dirtyPaths: [],
		childEntries: [
			{
				entry: createFelsEntry('sector', { id: 'east', name: 'East Sector' }),
				path: 'crags/wall',
				topo: {
					id: 'wall:east',
					routes: [{ id: 'east-1', name: 'East Crack', pathRefs: [] }],
					paths: { type: 'FeatureCollection', features: [] }
				},
				access: null,
				dirtyPaths: [],
				childEntries: []
			}
		]
	};
	state.activeWorkspaceEntryPath = 'crags/wall';

	const tool = createCragRouteTool({
		state,
		getSelection: () => null,
		selectObject: () => {},
		getRouteDraft: () => null,
		cancelTrackEdit: () => {},
		startRouteDraft: () => {},
		startRoutingDraft: () => {},
		editRoutePathTrack: () => {},
		setActiveTool: () => {}
	});

	expect(tool.assignAccessTrackToAllRoutes('approach-shared', 'approach')).toBe(true);
	expect(state.workspace.access.features).toHaveLength(0);
	expect(state.workspace.topo.paths.features).toHaveLength(1);
	expect(state.workspace.topo.paths.features[0].properties.description).toBe('From main car park');
	expect(state.workspace.topo.routes[0].pathRefs).toHaveLength(1);
	expect(state.workspace.childEntries[0].topo.paths.features).toHaveLength(1);
	expect(state.workspace.childEntries[0].topo.routes[0].pathRefs).toHaveLength(1);

	// Split track tails are also saved and assigned
	expect(
		tool.saveTrackAsRoutePath('crags/wall/wall-topo.json', 'route-1', {
			coordinates: [
				[16, 48],
				[16.01, 48.01]
			],
			name: 'Split Track',
			role: 'descent',
			extraSegments: [
				[
					[16.02, 48.02],
					[16.03, 48.03]
				]
			]
		})
	).toBe(true);
	expect(state.workspace.topo.paths.features).toHaveLength(3);
	expect(state.workspace.topo.paths.features[1].properties.name).toBe('Split Track');
	expect(state.workspace.topo.paths.features[2].properties.name).toBe('Split Track · 2');
	expect(state.workspace.topo.routes[0].pathRefs).toHaveLength(3);
});

// @vitest-environment node
import { expect, test } from 'vitest';
import { createCragEditorSession, createFelsEntry } from '$lib/state/crag-session.svelte.ts';
import { createCragRouteTool } from './CragRouteTool.svelte.js';

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

test('adding a path and attaching it to a route is one undo step', () => {
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
	const tool = createCragRouteTool({
		state,
		startRouteDraft: () => {},
		startRoutingDraft: () => {}
	});
	tool.addRoutePath('crags/wall/wall-topo.json', 'route-1');
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

// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCragEditorSession } from '$lib/state/crag-session.svelte.js';
import { createCragRouteTool } from './CragRouteTool.svelte.js';

function createTool() {
	const state = createCragEditorSession();
	state.crag.id = 'crag-1';
	state.crag.path = 'crags/crag-1';
	state.crag.name = 'Test Crag';
	let selection = null;
	let routeDraft = null;
	const activeTools = [];

	const tool = createCragRouteTool({
		state,
		getSelection: () => selection,
		selectObject: (value) => (selection = value),
		getRouteDraft: () => routeDraft,
		cancelTrackEdit: () => (routeDraft = null),
		startRouteDraft: (value) => (routeDraft = value),
		startRoutingDraft: () => activeTools.push('track'),
		editRoutePathTrack: () => activeTools.push('track-edit'),
		setActiveTool: (value) => activeTools.push(value)
	});

	return { state, tool, selection: () => selection, routeDraft: () => routeDraft, activeTools };
}

test('creates, selects, and updates routes through the session', () => {
	const { state, tool, selection } = createTool();

	tool.addRoute();

	const document = state.routeDocuments[0];
	const route = document.data.routes[0];
	assert.equal(route.type, 'sports-climbing');
	assert.deepEqual(selection(), { type: 'route', key: `${document.path}:${route.id}` });

	tool.updateRoute(document.path, route.id, 'name', 'First route');
	assert.equal(state.routeDocuments[0].data.routes[0].name, 'First route');
});

test('manages route paths, access copies, and route-specific metadata', () => {
	const { state, tool, activeTools } = createTool();
	tool.addRoute();
	const document = state.routeDocuments[0];
	const route = document.data.routes[0];

	tool.addRoutePath(document.path, route.id);
	const createdPath = document.data.paths.features[0];
	assert.equal(route.pathRefs[0].pathId, createdPath.id);
	assert.deepEqual(activeTools, ['track']);

	tool.updateRoutePath(document.path, route.id, createdPath.id, 'label', 'Main line');
	assert.equal(route.pathRefs[0].label, 'Main line');

	state.access.features = [{
		id: 'approach-1',
		properties: { kind: 'approach', name: 'Approach' },
		geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
	}];
	assert.equal(tool.createRoutePathFromAccess(document.path, route.id, 'approach-1'), true);
	assert.equal(document.data.paths.features.length, 2);
	assert.equal(route.pathRefs.length, 2);
});

test('deletes and restores a route path with its route references', () => {
	const { state, tool } = createTool();
	tool.addRoute();
	const document = state.routeDocuments[0];
	const route = document.data.routes[0];
	tool.addRoutePath(document.path, route.id);
 	const pathId = document.data.paths.features[0].id;

	assert.equal(tool.deleteRoutePath(document.path, pathId), true);
	assert.equal(document.data.paths.features.length, 0);
	assert.equal(route.pathRefs.length, 0);

	assert.equal(tool.undoDeleteRoutePath(), true);
	assert.equal(document.data.paths.features[0].id, pathId);
	assert.deepEqual(route.pathRefs, [{ pathId, role: 'main' }]);
});

test('splits a route path and exits track cutting mode', () => {
	const { state, tool, activeTools } = createTool();
	tool.addRoute();
	const document = state.routeDocuments[0];
	const route = document.data.routes[0];
	tool.addRoutePath(document.path, route.id);
	const pathId = document.data.paths.features[0].id;
	state.updateRouteDocument(document.path, (data) => {
		data.paths.features[0].geometry.coordinates = [[0, 0], [1, 1], [2, 2]];
	});

	assert.equal(tool.splitRoutePath({ documentPath: document.path, pathId, routeId: route.id }, [[0, 0], [1, 1]], [[1, 1], [2, 2]]), true);
	assert.equal(document.data.paths.features.length, 2);
	assert.equal(activeTools.at(-1), 'position');
});

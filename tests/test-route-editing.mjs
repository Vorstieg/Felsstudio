// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { useCragTrackEditor } from '../src/lib/components/editor/crag/use-crag-track-editor.svelte.js';

function createEditor(initialCoordinates) {
	let target = { documentPath: 'crag-topo.json', routeId: 'route-1', pathId: 'path-1' };
	const savedCoordinates = [];
	const activeTools = [];

	const editor = useCragTrackEditor({
		getMap: () => null,
		getActiveTool: () => activeTools.at(-1) || 'select',
		setActiveTool: (tool) => activeTools.push(tool),
		setSuppressNextMapClick: () => {},
		getRoutePathTarget: () => target,
		onSaveRoutePath: (_, coordinates) => savedCoordinates.push(coordinates),
		onRoutePathDrawingEnd: () => {
			target = null;
		},
		onPathFinished: () => {},
		onPathCancelled: () => {}
	});

	return { editor, target: () => target, savedCoordinates, activeTools, initialCoordinates };
}

test('commits an edited route path and closes the edit context', () => {
	const { editor, target, savedCoordinates, activeTools } = createEditor();

	editor.editRoutePath([
		[16, 48],
		[16.001, 48.001]
	]);
	assert.equal(activeTools.at(-1), 'track');

	assert.equal(editor.commitRoutePathEdit(), true);
	assert.deepEqual(savedCoordinates, [
		[
			[16, 48],
			[16.001, 48.001]
		]
	]);
	assert.equal(target(), null);
});

test('allows an empty route path to enter edit mode', () => {
	const { editor, target, savedCoordinates, activeTools } = createEditor();

	editor.editRoutePath([]);
	assert.equal(activeTools.at(-1), 'track');
	assert.equal(editor.currentTrackPoints.length, 0);

	assert.equal(editor.commitRoutePathEdit(), true);
	assert.deepEqual(savedCoordinates, []);
	assert.equal(target(), null);
});

test('canceling an edited route path does not save geometry', () => {
	const { editor, target, savedCoordinates } = createEditor();

	editor.editRoutePath([
		[16, 48],
		[16.001, 48.001]
	]);
	editor.cancelTrackEdit();

	assert.deepEqual(savedCoordinates, []);
	assert.equal(target(), null);
});

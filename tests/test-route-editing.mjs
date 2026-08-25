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

test('opens an existing path in select mode and supports range selection and bulk deletion', () => {
	const { editor } = createEditor();
	editor.editRoutePath([
		[16, 48],
		[16.001, 48.001],
		[16.002, 48.002],
		[16.003, 48.003]
	]);

	assert.equal(editor.trackDraftMode, 'select');
	editor.toggleTrackPointSelection(1);
	editor.toggleTrackPointSelection(3, { range: true });
	assert.deepEqual(editor.selectedTrackPointIndexes, [1, 2, 3]);
	assert.equal(editor.deleteSelectedTrackPoints(), false, 'must retain two vertices');
	editor.toggleTrackPointSelection(3);
	assert.deepEqual(editor.selectedTrackPointIndexes, [1, 2]);
	assert.equal(editor.deleteSelectedTrackPoints(), true);
	assert.deepEqual(editor.currentTrackPoints, [
		[16, 48],
		[16.003, 48.003]
	]);
	assert.equal(editor.selectedTrackPointCount, 0);
	editor.undoTrackPoint();
	assert.equal(editor.currentTrackPoints.length, 4);
});

test('selects vertices inside an empty-map marquee rectangle', () => {
	const { editor } = createEditor();
	editor.editRoutePath([
		[16, 48],
		[16.001, 48.001],
		[16.002, 48.002],
		[16.003, 48.003]
	]);

	editor.selectTrackPointScreenRegion(
		{ x: 10, y: 10 },
		{ x: 31, y: 31 },
		{ project: ([lng]) => ({ x: (lng - 16) * 10000, y: (lng - 16) * 10000 }) }
	);
	assert.deepEqual(editor.selectedTrackPointIndexes, [1, 2, 3]);
});

test('simplifies only selected vertex runs', () => {
	const { editor } = createEditor();
	const points = [
		[16, 48],
		[16.0005, 48],
		[16.001, 48],
		[16.0015, 48],
		[16.002, 48.001]
	];
	editor.editRoutePath(points);
	editor.toggleTrackPointSelection(1);
	editor.toggleTrackPointSelection(3, { range: true });

	const result = editor.simplifyTrack(100);
	assert.equal(result.changed, true);
	assert.deepEqual(editor.currentTrackPoints[0], points[0]);
	assert.deepEqual(editor.currentTrackPoints.at(-1), points.at(-1));
	assert.equal(
		editor.currentTrackPoints.some(
			(point) => point[0] === points[4][0] && point[1] === points[4][1]
		),
		true
	);
	assert.equal(editor.selectedTrackPointCount, 0);
});

test('supports delete mode with undoable single-point removal', () => {
	const { editor } = createEditor();
	editor.editRoutePath([
		[16, 48],
		[16.001, 48.001],
		[16.002, 48.002]
	]);
	editor.setTrackDraftMode('delete');
	assert.equal(editor.trackDraftMode, 'delete');
	assert.equal(editor.removeTrackPoint(1), true);
	assert.equal(editor.currentTrackPoints.length, 2);
	editor.undoTrackPoint();
	assert.equal(editor.currentTrackPoints.length, 3);
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

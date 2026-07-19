import assert from 'node:assert/strict';
import { createServer } from 'vite';

// The production module imports the renderer, which uses Vite's import.meta.glob.
// Load it through Vite so this remains an executable smoke test rather than a
// Node-only duplicate of the geometry implementation.
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
const {
	closePath,
	getPathMidpoints,
	insertPathVertex,
	isClosedPath,
	movePathVertex,
	removePathVertex,
	translatePath
} = await vite.ssrLoadModule('/src/lib/assets/js/path-geometry.js');
const {
	OUTLINE_PRESETS,
	OUTLINE_SHAPE_TYPES,
	applyPresetSemanticHandle,
	convertPresetToPolyline,
	createOutlineRecord,
	createPresetPoints,
	createPresetShape,
	getPresetSemanticHandles,
	isPresetOutline,
	prepareOutlinesForExport,
	setOutlinePoint,
	translateOutline,
	updatePresetOutline
} = await vite.ssrLoadModule('/src/lib/assets/js/outline-geometry.js');

const open = [
	[0, 0],
	[2, 0],
	[2, 2]
];
assert.deepEqual(movePathVertex(open, 1, [1, 1]), [
	[0, 0],
	[1, 1],
	[2, 2]
]);
assert.deepEqual(insertPathVertex(open, 1, [1, 0]), [
	[0, 0],
	[1, 0],
	[2, 0],
	[2, 2]
]);
assert.deepEqual(removePathVertex(open, 1), [
	[0, 0],
	[2, 2]
]);
assert.deepEqual(translatePath(open, [1, -1]), [
	[1, -1],
	[3, -1],
	[3, 1]
]);

const closed = closePath([
	[0, 0],
	[2, 0],
	[2, 2],
	[0, 2]
]);
assert.equal(isClosedPath(closed), true);
assert.deepEqual(movePathVertex(closed, 0, [-1, -1]), [
	[-1, -1],
	[2, 0],
	[2, 2],
	[0, 2],
	[-1, -1]
]);
assert.deepEqual(movePathVertex(closed, closed.length - 1, [-2, -2]), [
	[-2, -2],
	[2, 0],
	[2, 2],
	[0, 2],
	[-2, -2]
]);
assert.deepEqual(insertPathVertex(closed, 2, [3, 1]), [
	[0, 0],
	[2, 0],
	[3, 1],
	[2, 2],
	[0, 2],
	[0, 0]
]);
assert.deepEqual(removePathVertex(closed, 0), [
	[2, 0],
	[2, 2],
	[0, 2],
	[2, 0]
]);
assert.deepEqual(
	getPathMidpoints(closed).map((item) => item.point),
	[
		[1, 0],
		[2, 1],
		[1, 2],
		[0, 1]
	]
);

const presetBounds = {
	start: [0.1, 0.2],
	end: [0.7, 0.8]
};
for (const preset of OUTLINE_PRESETS) {
	const points = createPresetPoints(preset.id, presetBounds.start, presetBounds.end);
	assert.ok(points.length >= 4, `${preset.id} has enough points for a closed polygon`);
	assert.deepEqual(points[0], points.at(-1), `${preset.id} is closed`);
	for (const [x, y] of points) {
		assert.ok(x >= 0.1 && x <= 0.7, `${preset.id} x stays in drag bounds`);
		assert.ok(y >= 0.2 && y <= 0.8, `${preset.id} y stays in drag bounds`);
	}
}

const presetShape = createPresetShape('pillar', presetBounds.start, presetBounds.end, {
	semantic: { taper: 0.2 }
});
assert.equal(presetShape.type, OUTLINE_SHAPE_TYPES.POLYLINE);
assert.equal(presetShape.preset, 'pillar');
assert.deepEqual(presetShape.semantic, { version: 1, taper: 0.2 });

const presetOutline = createOutlineRecord({
	id: 'outline-preset',
	shape: presetShape,
	points2D: presetShape.points2D
});
assert.equal(isPresetOutline(presetOutline), true);
assert.equal(presetOutline.closed, true);
assert.deepEqual(
	getPresetSemanticHandles(presetOutline).map((handle) => handle.id),
	['width', 'height', 'lean', 'taper']
);

const translatedPreset = structuredClone(presetOutline);
translateOutline(translatedPreset, 0.1, -0.1);
assert.equal(isPresetOutline(translatedPreset), true, 'translation keeps preset provenance');
assert.deepEqual(translatedPreset.points2D[0], [0.368, 0.1]);

const convertedPreset = structuredClone(presetOutline);
setOutlinePoint(convertedPreset, 1, [0.65, 0.3]);
assert.deepEqual(convertedPreset.shape, {
	type: OUTLINE_SHAPE_TYPES.POLYLINE,
	points2D: convertedPreset.points2D
});
assert.equal(
	isPresetOutline(convertedPreset),
	false,
	'a vertex edit converts a preset to a plain path'
);

const explicitlyConverted = structuredClone(presetOutline);
convertPresetToPolyline(explicitlyConverted);
assert.equal(isPresetOutline(explicitlyConverted), false);
assert.equal(explicitlyConverted.closed, true);

const exportedPreset = prepareOutlinesForExport([presetOutline])[0];
assert.equal(exportedPreset.shape.preset, 'pillar', 'export retains optional preset provenance');
assert.deepEqual(
	exportedPreset.points2D,
	presetOutline.points2D,
	'export contains compatible points'
);

const semanticallyResized = updatePresetOutline(presetOutline, { width: 0.9, height: 0.4 });
assert.notEqual(semanticallyResized, presetOutline, 'semantic editing is pure');
assert.equal(semanticallyResized.shape.type, OUTLINE_SHAPE_TYPES.POLYLINE);
assert.equal(semanticallyResized.shape.preset, 'pillar');
assert.equal(semanticallyResized.closed, true);
assert.equal(semanticallyResized.shape.semantic.width, 0.9);
assert.equal(semanticallyResized.shape.semantic.height, 0.4);
assert.deepEqual(semanticallyResized.points2D[0], semanticallyResized.points2D.at(-1));

const leanedPillar = updatePresetOutline(presetOutline, { lean: 0.25, taper: -0.2 });
assert.equal(leanedPillar.shape.semantic.lean, 0.25);
assert.equal(leanedPillar.shape.semantic.taper, -0.2);
assert.notDeepEqual(leanedPillar.points2D, presetOutline.points2D);

const caveShape = createPresetShape('cave', presetBounds.start, presetBounds.end);
const caveOutline = createOutlineRecord({
	id: 'outline-cave',
	shape: caveShape,
	points2D: caveShape.points2D
});
const deeperCave = updatePresetOutline(caveOutline, { notchDepth: 0.2 });
assert.equal(deeperCave.shape.semantic.notchDepth, 0.2);
assert.notEqual(deeperCave.points2D[7][1], caveOutline.points2D[7][1]);

const widenedByHandle = applyPresetSemanticHandle(presetOutline, 'width', [1, 0.5]);
assert.ok(Math.abs(widenedByHandle.shape.semantic.width - 0.828) < 1e-10);
const unchangedUnsupportedParameter = updatePresetOutline(
	createOutlineRecord({
		id: 'outline-boulder',
		shape: createPresetShape('boulder', presetBounds.start, presetBounds.end),
		points2D: createPresetPoints('boulder', presetBounds.start, presetBounds.end)
	}),
	{ taper: 0.3 }
);
assert.equal(unchangedUnsupportedParameter.shape.semantic.taper, undefined);

console.log('path geometry tests passed');
await vite.close();

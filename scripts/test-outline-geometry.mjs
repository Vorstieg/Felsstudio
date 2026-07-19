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
	pointsToSmoothSvgPath,
	pointsToSvg,
	prepareOutlinesForExport,
	setOutlinePoint,
	translateOutline,
	updatePresetOutline
} = await vite.ssrLoadModule('/src/lib/assets/js/outline-geometry.js');
const { createBrushMaskOutline, createBrushOutline, isValidBrushOutline } =
	await vite.ssrLoadModule('/src/lib/assets/js/brush-outline-geometry.js');
const { createBrushMaskPredicate, findBrushImageEdge } = await vite.ssrLoadModule(
	'/src/lib/assets/js/brush-edge-assist.js'
);

const open = [
	[0, 0],
	[2, 0],
	[2, 2]
];
const canvasSize = { baseWidth: 100, baseHeight: 200 };
const originalOpenPoints = structuredClone(open);
const openSmoothPath = pointsToSmoothSvgPath(open, { ...canvasSize, tension: 0.45 });
assert.match(openSmoothPath, /^M 0,0 C /, 'open outlines use cubic Bézier segments');
assert.ok(!openSmoothPath.endsWith('Z'), 'open smooth outlines remain open');
assert.deepEqual(open, originalOpenPoints, 'smooth rendering never mutates editable points');
assert.equal(
	pointsToSmoothSvgPath(open, { ...canvasSize, tension: 5 }),
	pointsToSmoothSvgPath(open, { ...canvasSize, tension: 1 }),
	'curve tension is constrained to its supported range'
);
assert.equal(
	pointsToSmoothSvgPath(open.slice(0, 2), canvasSize),
	null,
	'degenerate paths are not curved'
);
assert.equal(
	pointsToSvg(open, canvasSize),
	'0,0 200,0 200,400',
	'disabled curves retain the straight polyline representation'
);
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
const closedSmoothPath = pointsToSmoothSvgPath(closed, {
	...canvasSize,
	closed: true,
	tension: 0.45
});
assert.match(closedSmoothPath, / Z$/, 'closed smooth outlines close their path');
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
	assert.ok(points.length >= 4, `${preset.id} has enough points`);
	assert.equal(
		isClosedPath(points),
		preset.id !== 'pillar',
		`${preset.id} has the expected open or closed path`
	);
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
assert.equal(presetOutline.closed, false, 'pillar bases remain open');
assert.deepEqual(
	presetOutline.curve,
	{ enabled: false, tension: 0.45 },
	'new outlines are straight by default'
);
assert.deepEqual(
	getPresetSemanticHandles(presetOutline).map((handle) => handle.id),
	['width', 'height', 'lean', 'taper']
);

const curvedOutline = createOutlineRecord({
	id: 'outline-curved',
	points2D: open,
	curve: { enabled: true, tension: 3 }
});
assert.deepEqual(
	curvedOutline.curve,
	{ enabled: true, tension: 1 },
	'new curve settings are persisted with a valid tension'
);

const translatedPreset = structuredClone(presetOutline);
translateOutline(translatedPreset, 0.1, -0.1);
assert.equal(isPresetOutline(translatedPreset), true, 'translation keeps preset provenance');
assert.ok(Math.abs(translatedPreset.points2D[0][0] - 0.272) < 1e-10);
assert.ok(Math.abs(translatedPreset.points2D[0][1] - 0.7) < 1e-10);

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
assert.equal(explicitlyConverted.closed, false);

const exportedPreset = prepareOutlinesForExport([presetOutline])[0];
assert.equal(exportedPreset.shape.preset, 'pillar', 'export retains optional preset provenance');
assert.deepEqual(
	exportedPreset.points2D,
	presetOutline.points2D,
	'export contains compatible points'
);
assert.deepEqual(
	exportedPreset.curve,
	{ enabled: false, tension: 0.45 },
	'export retains optional curve settings'
);

const semanticallyResized = updatePresetOutline(presetOutline, { width: 0.9, height: 0.4 });
assert.notEqual(semanticallyResized, presetOutline, 'semantic editing is pure');
assert.equal(semanticallyResized.shape.type, OUTLINE_SHAPE_TYPES.POLYLINE);
assert.equal(semanticallyResized.shape.preset, 'pillar');
assert.equal(semanticallyResized.closed, false);
assert.equal(semanticallyResized.shape.semantic.width, 0.9);
assert.equal(semanticallyResized.shape.semantic.height, 0.4);
assert.notDeepEqual(semanticallyResized.points2D[0], semanticallyResized.points2D.at(-1));

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

const brushCanvas = { baseWidth: 1000, baseHeight: 500 };
const brushOutline = createBrushOutline(
	[
		[0.2, 0.4],
		[0.45, 0.4],
		[0.7, 0.6]
	],
	{ brushRadiusPx: 20, canvasSize: brushCanvas, simplifyTolerancePx: 1 }
);
assert.ok(brushOutline.length > 6, 'a brush stroke creates an editable polygon');
assert.deepEqual(brushOutline[0], brushOutline.at(-1), 'brush polygon is closed');
assert.equal(isValidBrushOutline(brushOutline, brushCanvas), true, 'brush polygon is valid');
const brushXs = brushOutline.map(([x]) => x);
const brushYs = brushOutline.map(([, y]) => y);
assert.ok(Math.min(...brushXs) < 0.2 && Math.max(...brushXs) > 0.7, 'brush adds horizontal radius');
assert.ok(Math.min(...brushYs) < 0.4 && Math.max(...brushYs) > 0.6, 'brush adds vertical radius');
const brushDot = createBrushOutline([[0.5, 0.5]], { brushRadiusPx: 16, canvasSize: brushCanvas });
assert.equal(
	isValidBrushOutline(brushDot, brushCanvas),
	true,
	'a single dab creates a valid circle'
);
assert.ok(brushDot.length <= 48, 'corner reduction keeps a mask circle practical to edit');
assert.ok(
	brushDot
		.slice(0, -1)
		.some(
			([x, y]) =>
				!Number.isInteger(x * brushCanvas.baseWidth) ||
				!Number.isInteger(y * brushCanvas.baseHeight)
		),
	'corner softening avoids retaining only raster-grid corners'
);
const paintedBlob = createBrushMaskOutline(
	[
		[0.45, 0.4],
		[0.55, 0.4],
		[0.55, 0.5],
		[0.45, 0.5],
		[0.45, 0.4],
		[0.5, 0.45]
	],
	{ brushRadiusPx: 18, canvasSize: brushCanvas, maskCellSizePx: 2, simplifyTolerancePx: 1 }
);
assert.equal(
	isValidBrushOutline(paintedBlob, brushCanvas),
	true,
	'a scribbled paint mask traces as a valid outline'
);
assert.ok(paintedBlob.length > 4, 'the traced mask retains an editable contour');
assert.deepEqual(
	createBrushOutline([], { canvasSize: brushCanvas }),
	[],
	'empty brush strokes are ignored'
);
assert.equal(
	isValidBrushOutline(
		[
			[0, 0],
			[1, 0],
			[0, 0]
		],
		brushCanvas
	),
	false,
	'degenerate paths are rejected'
);

const edgeCanvas = { baseWidth: 100, baseHeight: 100 };
const edgeData = new Uint8ClampedArray(100 * 100 * 4);
for (let y = 0; y < 100; y++) {
	for (let x = 0; x < 100; x++) {
		const offset = (y * 100 + x) * 4;
		const value = y < 52 ? 25 : 230;
		edgeData[offset] = edgeData[offset + 1] = edgeData[offset + 2] = value;
		edgeData[offset + 3] = 255;
	}
}
const edgeStroke = [
	[0.1, 0.48],
	[0.9, 0.48]
];
const maskContains = createBrushMaskPredicate(edgeStroke, {
	brushRadiusPx: 9,
	canvasSize: edgeCanvas
});
assert.equal(
	maskContains([0.5, 0.52]),
	true,
	'the reconstructed brush mask includes the painted region'
);
assert.equal(
	maskContains([0.5, 0.7]),
	false,
	'the reconstructed brush mask excludes the rest of the photo'
);
const edgePath = findBrushImageEdge({ width: 100, height: 100, data: edgeData }, edgeStroke, {
	canvasSize: edgeCanvas,
	brushRadiusPx: 9,
	minimumConfidence: 0.15
});
assert.ok(edgePath, 'a high contrast edge inside the brush mask is found');
assert.ok(edgePath.confidence > 0.15, 'the edge result reports useful confidence');
assert.ok(
	edgePath.points.every(([, y]) => Math.abs(y - 0.52) < 0.03),
	'the tracked path follows the image edge'
);
assert.equal(
	findBrushImageEdge({ width: 100, height: 100, data: edgeData }, [[0.5, 0.5]], {
		canvasSize: edgeCanvas
	}),
	null,
	'a single dab cannot imply an edge direction'
);

console.log('path geometry tests passed');
await vite.close();

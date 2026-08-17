// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createServer } from 'vite';

test('scales symbols according to the selected handle', async () => {
	const vite = await createServer({
		server: { middlewareMode: true, hmr: false, ws: false },
		appType: 'custom'
	});
	const { SymbolEditTool } = await vite.ssrLoadModule(
		'/src/lib/components/editor/tools/SymbolEditTool.svelte.js'
	);

	const topo = {
		fixPoints: [
			{
				id: 'bolt-1',
				type: 'bolt',
				position2D: [0.5, 0.5],
				scale2D: 1,
				scaleX2D: 1,
				scaleY2D: 1
			}
		],
		routes: []
	};
	const editor = {
		topo,
		viewport: { baseWidth: 1000, baseHeight: 500 },
		interaction: null,
		mutateDocument: (mutator) => mutator()
	};
	const tool = new SymbolEditTool(editor);
	const symbol = topo.fixPoints[0];

	editor.interaction = tool.createScaleInteraction(symbol, { x: 0.55, y: 0.5 }, 'x');
	tool.onMouseMove(null, { x: 0.65, y: 0.5 });
	assert.ok(Math.abs(symbol.scaleX2D - 3) < 1e-9, 'horizontal handle only stretches horizontally');
	assert.equal(symbol.scaleY2D, 1, 'horizontal stretch leaves vertical scale unchanged');

	editor.interaction = tool.createScaleInteraction(symbol, { x: 0.5, y: 0.55 }, 'y');
	tool.onMouseMove(null, { x: 0.5, y: 0.65 });
	assert.ok(Math.abs(symbol.scaleY2D - 3) < 1e-9, 'vertical handle only stretches vertically');

	editor.interaction = tool.createScaleInteraction(symbol, { x: 0.55, y: 0.55 });
	tool.onMouseMove(null, { x: 0.6, y: 0.6 });
	assert.ok(symbol.scale2D > 1, 'corner handle keeps proportional scaling available');
	await vite.close();
});

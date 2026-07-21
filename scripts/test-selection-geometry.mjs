import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
const { createSelectionRegion, getRegionSelection } = await vite.ssrLoadModule(
	'/src/lib/components/editor/2d/selection-geometry.js'
);

const topo = {
	routes: [
		{
			id: 'crossing-route',
			points2D: [
				[0.1, 0.5],
				[0.9, 0.5]
			]
		}
	],
	outlines: [
		{
			id: 'inside-outline',
			points2D: [
				[0.3, 0.3],
				[0.4, 0.4]
			]
		}
	],
	fixPoints: [{ id: 'bolt', position2D: [0.35, 0.35] }],
	textLabels: [{ id: 'label', position2D: [0.36, 0.36] }]
};

const contained = createSelectionRegion({ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 });
assert.equal(contained.containsOnly, true, 'left-to-right marquee requires complete containment');
assert.deepEqual(
	getRegionSelection(topo, contained, { baseWidth: 1000, baseHeight: 667 }),
	[
		{ type: 'outline', id: 'inside-outline' },
		{ type: 'symbol', id: 'bolt' },
		{ type: 'text', id: 'label' }
	],
	'contained selection excludes a line that only crosses the region'
);

const touching = createSelectionRegion({ x: 0.5, y: 0.2 }, { x: 0.2, y: 0.5 });
assert.equal(touching.containsOnly, false, 'right-to-left marquee selects touched items');
assert.ok(
	getRegionSelection(topo, touching, { baseWidth: 1000, baseHeight: 667 }).some(
		(item) => item.id === 'crossing-route'
	),
	'touching selection includes a crossing route'
);

await vite.close();
console.log('Selection geometry tests passed');

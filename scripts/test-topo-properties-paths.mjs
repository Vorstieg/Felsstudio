import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { addPathAsset, removePathAsset } = await vite.ssrLoadModule('/src/lib/components/editor/topo-properties/topo-properties-utils.js');

const document = {
	routes: [{ id: 'route-1', pathRefs: [] }],
	paths: { type: 'FeatureCollection', features: [] }
};
const route = document.routes[0];

const pathId = addPathAsset(route, document);
assert.match(pathId, /^path-/);
assert.deepEqual(route.pathRefs, [{ pathId, role: 'main', label: '' }]);
assert.equal(document.paths.features.length, 1);
assert.equal(document.paths.features[0].geometry.type, 'LineString');
assert.equal(Object.hasOwn(route, 'assets'), false);

document.paths.features[0].geometry.coordinates = [[16, 48], [16.001, 48.001]];
const feature = document.paths.features.find((item) => String(item.id) === String(route.pathRefs[0].pathId));
assert.deepEqual(feature.geometry.coordinates, [[16, 48], [16.001, 48.001]]);

route.pathRefs[0].role = 'approach';
route.pathRefs[0].label = 'Common approach';
assert.equal(route.pathRefs[0].role, 'approach');
assert.equal(route.pathRefs[0].label, 'Common approach');

removePathAsset(route, pathId, document);
assert.deepEqual(route.pathRefs, []);
assert.equal(document.paths.features.length, 1, 'unassigning does not delete shared geometry');
assert.equal(Object.hasOwn(route, 'assets'), false);

console.log('topo properties path workflow: valid');

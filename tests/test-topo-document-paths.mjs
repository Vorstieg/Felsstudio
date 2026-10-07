// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	assignTopoPath,
	deleteTopoPath,
	routesUsingTopoPath,
	splitTopoPath,
	unassignTopoPath,
	validateTopoPaths
} from '../src/lib/assets/js/topo-document-paths.ts';

test('manages and validates topo document paths', () => {
	const document = {
		paths: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'common',
					properties: { name: 'Common' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[1, 2],
							[3, 4]
						]
					}
				}
			]
		},
		routes: [
			{ id: 'route-1', pathRefs: [{ pathId: 'common', role: 'approach' }] },
			{ id: 'route-2', pathRefs: [] }
		]
	};
	assert.equal(document.paths.features.length, 1);
	assert.deepEqual(document.routes[0].pathRefs[0].role, 'approach');
	const pathId = document.paths.features[0].id;
	assert.equal(assignTopoPath(document, 'route-2', pathId, { role: 'descent' }), true);
	assert.equal(assignTopoPath(document, 'route-2', pathId), false);
	assert.equal(routesUsingTopoPath(document, pathId).length, 2);
	assert.deepEqual(validateTopoPaths(document), []);
	assert.equal(unassignTopoPath(document, 'route-1', pathId), true);
	assert.equal(routesUsingTopoPath(document, pathId).length, 1);
	assert.equal(deleteTopoPath(document, pathId), true);
	assert.equal(document.paths.features.length, 0);
	assert.equal(document.routes[1].pathRefs.length, 0);
	assert.deepEqual(validateTopoPaths(document), []);

	const shared = {
		paths: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'shared',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[1, 1],
							[2, 2]
						]
					}
				}
			]
		},
		routes: [
			{ id: 'a', pathRefs: [{ pathId: 'shared', role: 'approach' }] },
			{ id: 'b', pathRefs: [{ pathId: 'shared', role: 'descent' }] }
		]
	};
	assert.deepEqual(
		splitTopoPath(
			shared,
			'shared',
			[
				[0, 0],
				[1, 1]
			],
			[
				[1, 1],
				[2, 2]
			]
		),
		['shared', 'shared-2']
	);
	assert.equal(shared.paths.features.length, 2);
	assert.equal(shared.routes[0].pathRefs.length, 2);
	assert.equal(shared.routes[1].pathRefs.length, 2);
	assert.deepEqual(validateTopoPaths(shared), []);

	const routeSpecific = {
		paths: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'shared',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[1, 1],
							[2, 2]
						]
					}
				}
			]
		},
		routes: [
			{ id: 'a', pathRefs: [{ pathId: 'shared' }] },
			{ id: 'b', pathRefs: [{ pathId: 'shared' }] }
		]
	};
	splitTopoPath(
		routeSpecific,
		'shared',
		[
			[0, 0],
			[1, 1]
		],
		[
			[1, 1],
			[2, 2]
		],
		{ mode: 'route-specific', routeId: 'a' }
	);
	assert.equal(
		routeSpecific.paths.features.length,
		3,
		'route-specific split preserves the shared source path'
	);
	assert.equal(routeSpecific.routes[0].pathRefs.length, 2);
	assert.deepEqual(
		routeSpecific.routes[1].pathRefs.map((ref) => ref.pathId),
		['shared']
	);
	assert.deepEqual(validateTopoPaths(routeSpecific), []);

	const invalid = {
		routes: [{ id: 'broken', pathRefs: [{ pathId: 'missing' }] }]
	};
	assert.match(validateTopoPaths(invalid).join('\n'), /missing/);
});

test('path lookup and validation do not repair the document', () => {
	const document = { routes: [{ id: 'route-1' }] };
	const before = structuredClone(document);
	assert.deepEqual(validateTopoPaths(document), []);
	assert.deepEqual(routesUsingTopoPath(document, 'missing'), []);
	assert.deepEqual(document, before);
});

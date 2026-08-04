// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	assignTopoPath,
	deleteTopoPath,
	normalizeTopoPaths,
	routesUsingTopoPath,
	splitTopoPath,
	unassignTopoPath,
	validateTopoPaths
} from '../src/lib/assets/js/topo-document-paths.js';

test('manages, migrates, and validates topo document paths', () => {
	const legacy = {
		routes: [
			{
				id: 'route-1',
				assets: {
					paths: [
						{
							role: 'approach',
							label: 'Common',
							path: {
								type: 'LineString',
								coordinates: [
									[1, 2],
									[3, 4]
								]
							}
						}
					],
					keep: true
				}
			},
			{ id: 'route-2', pathRefs: [] }
		]
	};
	const migrated = normalizeTopoPaths(legacy);
	assert.equal(migrated.migrated, true);
	assert.equal(migrated.data.paths.features.length, 1);
	assert.equal(migrated.data.routes[0].assets.keep, true);
	assert.deepEqual(migrated.data.routes[0].pathRefs[0].role, 'approach');
	const pathId = migrated.data.paths.features[0].id;
	assert.equal(assignTopoPath(migrated.data, 'route-2', pathId, { role: 'descent' }), true);
	assert.equal(assignTopoPath(migrated.data, 'route-2', pathId), false);
	assert.equal(routesUsingTopoPath(migrated.data, pathId).length, 2);
	assert.deepEqual(validateTopoPaths(migrated.data), []);
	assert.equal(unassignTopoPath(migrated.data, 'route-1', pathId), true);
	assert.equal(routesUsingTopoPath(migrated.data, pathId).length, 1);
	assert.equal(deleteTopoPath(migrated.data, pathId), true);
	assert.equal(migrated.data.routes[1].pathRefs.length, 0);
	assert.deepEqual(validateTopoPaths(migrated.data), []);

	const shared = normalizeTopoPaths({
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
	}).data;
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

	const routeSpecific = normalizeTopoPaths({
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
	}).data;
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

	const invalid = normalizeTopoPaths({
		routes: [{ id: 'broken', pathRefs: [{ pathId: 'missing' }] }]
	}).data;
	assert.match(validateTopoPaths(invalid).join('\n'), /missing/);
});

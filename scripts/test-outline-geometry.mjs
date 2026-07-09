import assert from 'node:assert/strict';
import {
	closePath,
	getPathMidpoints,
	insertPathVertex,
	isClosedPath,
	movePathVertex,
	removePathVertex,
	translatePath
} from '../src/lib/assets/js/path-geometry.js';

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

console.log('path geometry tests passed');

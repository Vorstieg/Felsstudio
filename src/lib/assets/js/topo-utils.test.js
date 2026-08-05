// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
	calculateBoltAmount,
	calculateRouteLength,
	convertRouteType,
	getDefaultGeometryMode
} from './topo-utils.js';

describe('topo utilities', () => {
	it.each([
		['alpine-tour', 'track'],
		['via-ferrata', 'hybrid'],
		['sport', 'topo']
	])('chooses the default geometry mode for %s', (type, expected) => {
		expect(getDefaultGeometryMode(type)).toBe(expected);
	});

	it('calculates route length using the supplied scale', () => {
		expect(
			calculateRouteLength(
				{
					points: [
						[0, 0, 0],
						[3, 4, 0]
					]
				},
				2
			)
		).toBe(10);
		expect(calculateRouteLength({ points: [[0, 0, 0]] })).toBe(0);
	});

	it('counts only bolt fixpoints referenced by the route', () => {
		const route = { fixPoints: ['bolt', 'anchor', 'missing'] };
		const fixPoints = [
			{ id: 'bolt', type: 'bolt' },
			{ id: 'anchor', type: 'anchor' },
			{ id: 'unused-bolt', type: 'bolt' }
		];

		expect(calculateBoltAmount(route, fixPoints)).toBe(1);
	});

	it('converts a single-pitch route to multi-pitch and back', () => {
		const route = {
			type: 'sport',
			grade: '6a',
			_gradeScale: 'french',
			length: 24,
			description: 'A sustained wall',
			points: [
				[0, 0, 0],
				[1, 1, 0]
			]
		};

		convertRouteType(route, 'multi-pitch');

		expect(route.type).toEqual(['multi-pitch']);
		expect(route.pitches).toHaveLength(1);
		expect(route.pitches[0]).toMatchObject({
			pitchNumber: 1,
			grade: '6a',
			length: 24,
			points: [
				[0, 0, 0],
				[1, 1, 0]
			]
		});
		expect(route.length).toBe(0);
		expect(route.points).toEqual([]);

		convertRouteType(route, 'sport');

		expect(route.type).toEqual(['sport']);
		expect(route).toMatchObject({
			grade: '6a',
			_gradeScale: 'french',
			length: 24,
			description: 'A sustained wall',
			points: [
				[0, 0, 0],
				[1, 1, 0]
			]
		});
		expect(route.pitches).toBeUndefined();
	});
});

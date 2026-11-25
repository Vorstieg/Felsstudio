import { describe, expect, it } from 'vitest';
import {
	getPrimaryPathRole,
	getRoutePathRoleMeta,
	inferRoutePathRole,
	nextRoutePathRole
} from './route-path-roles.ts';

describe('route-path-roles', () => {
	it('infers sensible default roles from German and English path names', () => {
		expect(inferRoutePathRole('Abseilpiste Nord')).toBe('descent');
		expect(inferRoutePathRole('Abstieg zur Hütte')).toBe('descent');
		expect(inferRoutePathRole('Zustieg vom Parkplatz')).toBe('approach');
		expect(inferRoutePathRole('South wall approach')).toBe('approach');
		expect(inferRoutePathRole('Ausstieg Variante links')).toBe('variant');
		expect(inferRoutePathRole('Sonnenriss Tour')).toBe('main');
		expect(inferRoutePathRole('', 'approach')).toBe('approach');
	});

	it('cycles roles cleanly and exposes metadata for each role', () => {
		expect(nextRoutePathRole('approach')).toBe('main');
		expect(nextRoutePathRole('main')).toBe('descent');
		expect(nextRoutePathRole('descent')).toBe('variant');
		expect(nextRoutePathRole('variant')).toBe('approach');
		expect(getRoutePathRoleMeta('descent').mapColor).toBe('#d97706');
		expect(getRoutePathRoleMeta('unknown').id).toBe('main');
	});

	it('resolves primary map role from assigned routes or falls back to path name', () => {
		const topo = {
			routes: [
				{ id: 'r1', pathRefs: [{ pathId: 'p1', role: 'descent' }] },
				{ id: 'r2', pathRefs: [{ pathId: 'p1', role: 'descent' }] }
			]
		};
		expect(getPrimaryPathRole(topo, { id: 'p1', properties: { name: 'Weg 1' } })).toBe('descent');
		expect(getPrimaryPathRole(topo, { id: 'p2', properties: { name: 'Zustieg Ost' } })).toBe(
			'approach'
		);
	});
});

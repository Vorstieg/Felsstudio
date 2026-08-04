// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createCragEditorSession, normalizeCragSector } from './crag-session.svelte.js';

describe('createCragEditorSession', () => {
	it('keeps crag sessions independent', () => {
		const first = createCragEditorSession();
		const second = createCragEditorSession();

		first.crag.name = 'First crag';
		first.crag.sectors.push({ id: 'sector-1' });

		expect(second.crag.name).toBe('');
		expect(second.crag.sectors).toEqual([]);
	});

	it('marks only the requested route document dirty', () => {
		const session = createCragEditorSession();
		session.routeDocuments = [
			{ path: 'one.json', dirty: false },
			{ path: 'two.json', dirty: false }
		];

		session.markDocumentDirty('two.json');

		expect(session.routeDocuments[0].dirty).toBe(false);
		expect(session.routeDocuments[1].dirty).toBe(true);
	});

	it('updates route documents through the action boundary', () => {
		const session = createCragEditorSession();
		session.routeDocuments = [{ path: 'routes.json', data: { routes: [] }, dirty: false }];

		session.updateRouteDocument('routes.json', (data) => {
			data.routes.push({ id: 'route-1' });
		});

		expect(session.routeDocuments[0].data.routes).toEqual([{ id: 'route-1' }]);
		expect(session.routeDocuments[0].dirty).toBe(true);
	});

	it('centralizes equipment and image collection updates', () => {
		const session = createCragEditorSession();
		session.setEquipment([{ name: 'quickdraw', amount: 12 }]);
		session.setCragImages([{ name: 'wall.jpg' }]);

		expect(session.crag.equipment).toEqual([{ name: 'quickdraw', amount: 12 }]);
		expect(session.crag.assets.images).toEqual([{ name: 'wall.jpg' }]);
	});

	it('normalizes sector collections at the session boundary', () => {
		const sector = { id: 'sector-1', topo: { site: 'guide' }, assets: { images: ['wall.jpg'] } };
		const normalized = normalizeCragSector(sector);
		const session = createCragEditorSession();
		session.setSectors([sector]);

		expect(normalized).toMatchObject({
			type: [],
			tags: [],
			topo: { site: 'guide', link: '' },
			assets: { images: ['wall.jpg'], topos: [], models: [], approaches: [] }
		});
		expect(session.crag.sectors[0]).toEqual(normalized);
		expect(sector).toEqual({ id: 'sector-1', topo: { site: 'guide' }, assets: { images: ['wall.jpg'] } });
	});
});

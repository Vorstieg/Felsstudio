// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
	createCragEditorSession,
	normalizeCragSector,
	validateHierarchy
} from './crag-session.svelte.ts';

function hierarchyEntry(key, kind, parentKey = null, childKeys = []) {
	return {
		key,
		feature: { ...createCragEditorSession().crag, id: key, name: key, kind },
		source: { path: '', id: key },
		parentKey,
		childKeys,
		dirty: false,
		isCurrent: key === 'current'
	};
}

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

	it('supports redo when exposed as an action callback', () => {
		const session = createCragEditorSession();
		session.setCragField('name', 'First name');
		session.setCragField('name', 'Second name');
		session.undo();

		const redo = session.redo;
		redo();

		expect(session.crag.name).toBe('Second name');
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
		expect(sector).toEqual({
			id: 'sector-1',
			topo: { site: 'guide' },
			assets: { images: ['wall.jpg'] }
		});
	});

	it('edits the active hierarchy or sector target and preserves target-aware undo', () => {
		const session = createCragEditorSession();
		const parent = hierarchyEntry('parent', 'area', null, ['current']);
		const current = hierarchyEntry('current', 'crag', 'parent');
		current.feature = session.crag;
		session.hierarchyEntries = [parent, current];
		session.crag.sectors = [normalizeCragSector({ id: 'north', name: 'North' })];

		session.setActiveMetadataTarget({ type: 'entry', key: 'parent' });
		session.setMetadataField('name', 'New parent');
		session.setActiveMetadataTarget({ type: 'sector', id: 'north' });
		session.setMetadataField('name', 'North wall');

		expect(parent.feature.name).toBe('New parent');
		expect(session.crag.sectors[0].name).toBe('North wall');
		session.undo();
		expect(session.crag.sectors[0].name).toBe('North');
		expect(session.hierarchyEntries[0].feature.name).toBe('New parent');
		session.redo();
		expect(session.crag.sectors[0].name).toBe('North wall');
	});

	it('validates hierarchy specificity while allowing equal kinds', () => {
		const equalParent = hierarchyEntry('parent', 'area', null, ['current']);
		const equalChild = hierarchyEntry('current', 'area', 'parent');
		expect(validateHierarchy([equalParent, equalChild])).toEqual([]);

		equalChild.feature.kind = 'crag';
		expect(validateHierarchy([equalParent, equalChild])).toEqual([]);

		equalChild.feature.kind = 'region';
		expect(
			validateHierarchy([equalParent, equalChild]).some((error) =>
				error.message.includes('at least as specific')
			)
		).toBe(true);

		equalParent.feature.kind = 'sector';
		equalChild.feature.kind = 'crag';
		expect(
			validateHierarchy([equalParent, equalChild]).some((error) =>
				error.message.includes('more specific than its child')
			)
		).toBe(true);
	});

	it('updates and dirties the parent child summary when identity metadata changes', () => {
		const session = createCragEditorSession();
		const parent = hierarchyEntry('parent', 'area', null, ['current']);
		parent.feature.sectors = [{ id: '', name: '', kind: 'crag' }];
		const current = hierarchyEntry('current', 'crag', 'parent');
		current.feature = session.crag;
		session.hierarchyEntries = [parent, current];
		session.setActiveMetadataTarget({ type: 'entry', key: 'current' });

		session.setMetadataField('name', 'Edited child');

		expect(parent.feature.sectors[0]).toMatchObject({ name: 'Edited child', kind: 'crag' });
		expect(parent.dirty).toBe(true);
	});

	it('moves a sector route document when its editable id changes', () => {
		const session = createCragEditorSession();
		session.crag.path = 'a/b';
		session.crag.id = 'wall';
		session.crag.sectors = [normalizeCragSector({ id: 'old', name: 'Old' })];
		session.routeDocuments = [
			{ path: 'old.json', sectorId: 'old', data: { sector_id: 'old', routes: [] }, dirty: false }
		];
		session.setActiveMetadataTarget({ type: 'sector', id: 'old' });

		session.setMetadataField('id', 'new');

		expect(session.activeMetadataTarget).toEqual({ type: 'sector', id: 'new' });
		expect(session.routeDocuments[0]).toMatchObject({
			path: 'a/b/wall/new/new-topo.json',
			sectorId: 'new',
			dirty: true,
			data: { sector_id: 'new' }
		});
		expect(session.sectorStorageMoves).toEqual([{ from: 'old', to: 'new' }]);
	});

	it('coalesces repeated sector id changes into one storage migration', () => {
		const session = createCragEditorSession();
		session.crag.sectors = [normalizeCragSector({ id: 'old', name: 'Old' })];
		session.setActiveMetadataTarget({ type: 'sector', id: 'old' });

		session.setMetadataField('id', 'middle');
		session.setMetadataField('id', 'new');

		expect(session.sectorStorageMoves).toEqual([{ from: 'old', to: 'new' }]);
	});

	it('commits geometry as one target-aware undo entry and restores dirty state', () => {
		const session = createCragEditorSession();
		const parent = hierarchyEntry('parent', 'area', null, ['current']);
		const current = hierarchyEntry('current', 'crag', 'parent');
		current.feature = session.crag;
		session.hierarchyEntries = [parent, current];
		session.crag.sectors = [
			normalizeCragSector({
				id: 'north',
				geometry: { type: 'Point', coordinates: [16, 48] }
			})
		];

		session.commitGeometry(
			{ type: 'entry', key: 'parent' },
			{ type: 'Point', coordinates: [17, 49] },
			'Move parent geometry'
		);

		expect(session.history.entries).toHaveLength(1);
		expect(session.hierarchyEntries[0].dirty).toBe(true);
		expect(session.hierarchyEntries[1].dirty).toBe(false);
		session.undo();
		expect(session.hierarchyEntries[0].feature.geometry.coordinates).not.toEqual([17, 49]);
		expect(session.hierarchyEntries[0].dirty).toBe(false);
		session.redo();
		expect(session.hierarchyEntries[0].feature.geometry.coordinates).toEqual([17, 49]);
		expect(session.hierarchyEntries[0].dirty).toBe(true);

		session.commitGeometry(
			{ type: 'sector', id: 'north' },
			{ type: 'Point', coordinates: [18, 50] },
			'Move sector geometry'
		);
		expect(session.history.entries).toHaveLength(2);
		expect(session.hierarchyEntries[0].dirty).toBe(true);
		expect(session.hierarchyEntries[1].dirty).toBe(true);
	});
});

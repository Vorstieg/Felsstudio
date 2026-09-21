// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createCragEditorSession } from '$lib/state/crag-session.svelte.ts';
import { createCragSectorTool } from './CragSectorTool.svelte.js';

function createTool() {
	const state = createCragEditorSession();
	state.crag.geometry = { type: 'Point', coordinates: [16, 48] };
	let selection = null;
	let activeTab = null;
	let activeTool = null;
	const map = {
		getZoom: () => 12,
		easeTo: (value) => (map.lastEase = value)
	};

	const tool = createCragSectorTool({
		state,
		getMap: () => map,
		getSelection: () => selection,
		selectObject: (value) => (selection = value),
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value)
	});

	return {
		state,
		tool,
		map,
		selection: () => selection,
		activeTab: () => activeTab,
		activeTool: () => activeTool
	};
}

describe('createCragSectorTool', () => {
	it('creates and focuses a sector through the session', () => {
		const { state, tool, selection, activeTab, activeTool, map } = createTool();

		tool.createSector();

		expect(state.crag.sectors[0]).toMatchObject({ id: 'sector-1', name: 'Sector 1' });
		expect(selection()).toEqual({ type: 'sector', id: 'sector-1' });
		expect(activeTab()).toBe('info');
		expect(activeTool()).toBe('geometry');

		tool.focusSector(state.crag.sectors[0]);
		expect(map.lastEase).toMatchObject({ center: [16, 48], zoom: 15 });
	});

	it('updates geometry and geometry type through the session', () => {
		const { state, tool } = createTool();
		tool.createSector();

		tool.updateSectorCoordinates('sector-1', [17, 49]);
		expect(state.crag.sectors[0].geometry.coordinates).toEqual([17, 49]);

		tool.setSectorGeometryType('sector-1', 'Polygon');
		expect(state.crag.sectors[0].geometry.type).toBe('Polygon');
		expect(state.canUndo).toBe(true);
	});

	it('syncs polygon sectors into their dedicated map source', () => {
		const { state, tool, map } = createTool();
		const sources = new Map();
		const layers = new Map();
		map.getSource = (id) => sources.get(id);
		map.addSource = (id, definition) =>
			sources.set(id, { ...definition, setData: (data) => (sources.get(id).data = data) });
		map.getLayer = (id) => layers.get(id);
		map.addLayer = (layer) => layers.set(layer.id, layer);
		state.setSectors([
			{
				id: 'sector-1',
				name: 'Wall',
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[16, 48],
							[16.1, 48],
							[16.1, 48.1],
							[16, 48]
						]
					]
				}
			}
		]);

		tool.syncDrawing();

		expect(sources.get('sector-editor-data').data.features).toEqual([
			expect.objectContaining({
				geometry: state.crag.sectors[0].geometry,
				properties: expect.objectContaining({ feature: 'sector', id: 'sector-1' })
			})
		]);
	});

	it('duplicates and removes sectors', () => {
		const { state, tool, selection } = createTool();
		tool.createSector();
		tool.createSector();

		tool.duplicateSector('sector-1');
		expect(state.crag.sectors.map((sector) => sector.id)).toEqual([
			'sector-1',
			'sector-2',
			'sector-1-copy'
		]);
		expect(selection()).toEqual({ type: 'sector', id: 'sector-1-copy' });

		tool.removeSector('sector-1-copy');
		expect(state.crag.sectors.map((sector) => sector.id)).toEqual(['sector-1', 'sector-2']);
	});
});

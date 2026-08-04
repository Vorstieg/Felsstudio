// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createCragEditorSession } from '$lib/state/crag-session.svelte.js';
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
		expect(activeTab()).toBe('sectors');
		expect(activeTool()).toBe('position');

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

	it('duplicates, reorders, and removes sectors', () => {
		const { state, tool, selection } = createTool();
		tool.createSector();
		tool.createSector();

		tool.duplicateSector('sector-1');
		expect(state.crag.sectors.map((sector) => sector.id)).toEqual(['sector-1', 'sector-2', 'sector-1-copy']);
		expect(selection()).toEqual({ type: 'sector', id: 'sector-1-copy' });

		tool.moveSector('sector-1-copy', -1);
		expect(state.crag.sectors.map((sector) => sector.id)).toEqual(['sector-1', 'sector-1-copy', 'sector-2']);

		tool.removeSector('sector-1-copy');
		expect(state.crag.sectors.map((sector) => sector.id)).toEqual(['sector-1', 'sector-2']);
	});
});

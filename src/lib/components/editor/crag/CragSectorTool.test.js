// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCragEditorSession, createFelsEntry } from '$lib/state/crag-session.svelte.ts';
import { loadFelsEntryWorkspaceDetails } from '$lib/assets/js/load-crag-editor-entry.ts';
import { createCragSectorTool } from './CragSectorTool.svelte.ts';

function setup() {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall' }),
		path: 'crags',
		topo: null,
		access: null,
		dirtyPaths: [],
		childEntries: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	let selection = null;
	return {
		state,
		selection: () => selection,
		tool: createCragSectorTool({
			state,
			getMap: () => null,
			getSelection: () => selection,
			selectObject: (value) => (selection = value),
			setActiveTool: () => {},
			setActiveTab: () => {}
		})
	};
}
describe('workspace sector tool', () => {
	it('creates, duplicates, and removes child workspace entries', () => {
		const { state, tool, selection } = setup();
		tool.createSector();
		tool.duplicateSector('child-1');
		expect(state.getActiveSectors().map((node) => node.entry.properties.id)).toEqual([
			'child-1',
			'child-1-copy'
		]);
		expect(selection()).toEqual({ type: 'entry', key: 'crags/wall/child-1-copy' });
		tool.removeSector('child-1-copy');
		expect(state.getActiveSectors()).toHaveLength(1);
	});

	it('restores the parent workspace after removing the active child', () => {
		const { state, tool, selection } = setup();
		tool.createSector();
		state.activeWorkspaceEntryPath = 'crags/wall/child-1';
		tool.removeSector('child-1');
		expect(state.activeWorkspaceEntryPath).toBeNull();
		expect(selection()).toEqual({ type: 'entry', key: 'crags/wall' });
	});
	it('opens a new child without requesting a folder that has not been saved', async () => {
		const { state, tool } = setup();
		tool.createSector();
		const child = state.getWorkspaceEntry('crags/wall/child-1');
		let listed = false;
		await loadFelsEntryWorkspaceDetails(
			state.workspace,
			'crags/wall/child-1',
			async () => {
				throw Error('missing file');
			},
			async () => {
				listed = true;
				throw Error('missing folder');
			}
		);
		expect(listed).toBe(false);
		expect(child.detailsLoaded).toBe(true);
	});
	it('chooses an unused child ID after gaps in the list', () => {
		const { state, tool } = setup();
		state.createWorkspaceEntry(createFelsEntry('area', { id: 'child-2' }));
		tool.createSector();
		expect(state.getActiveSectors().map((node) => node.entry.properties.id)).toEqual([
			'child-2',
			'child-1'
		]);
	});
	it('removes only the matching child of the active entry', () => {
		const { state, tool } = setup();
		const wall = state.getActiveWorkspaceEntry();
		const other = state.createWorkspaceEntry(createFelsEntry('area', { id: 'other' }));
		state.activeWorkspaceEntryPath = 'crags/wall/other';
		state.createWorkspaceEntry(createFelsEntry('area', { id: 'north' }));
		state.activeWorkspaceEntryPath = 'crags/wall';
		const direct = state.createWorkspaceEntry(createFelsEntry('area', { id: 'north' }));
		tool.removeSector('north');
		expect(wall.childEntries).not.toContain(direct);
		expect(other.childEntries.map((node) => node.entry.properties.id)).toEqual(['north']);
	});
	it('focuses a selected child after that child becomes active', () => {
		const { state } = setup();
		const child = state.createWorkspaceEntry(createFelsEntry('area', { id: 'north' }));
		state.activeWorkspaceEntryPath = 'crags/wall/north';
		const map = { getZoom: () => 12, easeTo: vi.fn() };
		const tool = createCragSectorTool({
			state,
			getMap: () => map,
			setActiveTool: () => {}
		});

		tool.focusSector(child, { select: false });
		expect(map.easeTo).toHaveBeenCalledWith({
			center: [16.37, 48.21],
			zoom: 15,
			duration: 400
		});
	});
});

import { createCragTrackPersistence } from './create-crag-track-persistence.ts';
import { describe, expect, it, vi } from 'vitest';
import { createCragSelectTool } from './CragSelectTool.svelte.ts';
import { useCragTrackEditor } from './use-crag-track-editor.svelte.ts';

vi.hoisted(() => {
	URL.createObjectURL = () => 'blob:test';
});

const event = { point: { x: 100, y: 100 } };
function fixture(features, overrides = {}) {
	const map = {
		getLayer: () => ({}),
		queryRenderedFeatures: vi.fn(() => features)
	};
	const options = {
		getMap: () => map,
		selectObject: vi.fn(),
		setActiveTab: vi.fn(),
		onEditTrack: vi.fn(),
		onEditRoutePath: vi.fn(),
		...overrides
	};
	return { tool: createCragSelectTool(options), ...options };
}

describe('global Select tool track editing', () => {
	it('opens a selected approach in point editing mode', () => {
		const coordinates = [
			[10, 47],
			[10.01, 47.01],
			[10.02, 47.02]
		];
		const track = {
			id: 'approach-a',
			properties: { name: 'Approach', kind: 'approach' },
			geometry: { type: 'LineString', coordinates }
		};
		let activeTool = 'select';
		const onShowOptions = vi.fn();
		const editor = useCragTrackEditor({
			persistence: createCragTrackPersistence({
				getWorkspaceAccess: () => ({ features: [track] })
			}),
			getMap: () => null,
			getActiveTool: () => activeTool,
			setActiveTool: (next) => {
				activeTool = next;
			},
			onShowOptions
		});
		const { tool, selectObject, setActiveTab } = fixture(
			[{ properties: { kind: 'approach', accessFeatureId: track.id } }],
			{ onEditTrack: editor.editTrack }
		);
		expect(tool.handleMapClick(event)).toBe(true);
		expect(selectObject).toHaveBeenCalledWith({ type: 'approach', id: track.id });
		expect(setActiveTab).toHaveBeenCalledWith('registry');
		expect(activeTool).toBe('track');
		expect(editor.sessionActive).toBe(true);
		expect(editor.trackDraftMode).toBe('select');
		expect(editor.activeTrackTarget).toEqual({ kind: 'access', featureId: track.id });
		expect(editor.currentTrackPoints).toEqual(coordinates);
		expect(onShowOptions).toHaveBeenCalledOnce();
	});

	it('opens a selected topo path with its document, route and path identifiers', () => {
		const { tool, selectObject, onEditRoutePath } = fixture(
			[
				{
					properties: {
						feature: 'route-path',
						documentPath: 'topos/wall',
						pathId: 12,
						pathIndex: 2
					}
				}
			],
			{
				getRouteDocuments: () => [
					{
						path: 'topos/wall',
						data: { routes: [{ id: 'route-a', pathRefs: [{ pathId: '12' }] }] }
					}
				]
			}
		);
		tool.handleMapClick(event);
		expect(selectObject).toHaveBeenCalledWith({
			type: 'route-path',
			documentPath: 'topos/wall',
			pathId: '12',
			pathIndex: 2
		});
		expect(onEditRoutePath).toHaveBeenCalledWith('topos/wall', 'route-a', 12, 2);
	});

	it('prefers a track over an overlapping sector', () => {
		const { tool, onEditTrack, selectObject } = fixture([
			{ properties: { feature: 'child-entry', path: 'crags/sector' } },
			{ properties: { kind: 'approach', accessFeatureId: 'approach-a' } }
		]);
		tool.handleMapClick(event);
		expect(onEditTrack).toHaveBeenCalledWith('approach-a');
		expect(selectObject).toHaveBeenCalledOnce();
	});

	it('continues to select sectors without entering track editing', () => {
		const { tool, selectObject, setActiveTab, onEditTrack, onEditRoutePath } = fixture([
			{ properties: { feature: 'child-entry', path: 'crags/sector' } }
		]);
		tool.handleMapClick(event);
		expect(selectObject).toHaveBeenCalledWith({ type: 'entry', key: 'crags/sector' });
		expect(setActiveTab).toHaveBeenCalledWith('info');
		expect(onEditTrack).not.toHaveBeenCalled();
		expect(onEditRoutePath).not.toHaveBeenCalled();
	});

	it('clears selection on empty map space without starting an edit', () => {
		const { tool, selectObject, onEditTrack, onEditRoutePath } = fixture([]);
		tool.handleMapClick(event);
		expect(selectObject).toHaveBeenCalledWith(null);
		expect(onEditTrack).not.toHaveBeenCalled();
		expect(onEditRoutePath).not.toHaveBeenCalled();
	});
});

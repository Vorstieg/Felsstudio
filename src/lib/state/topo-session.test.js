// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopo2DEditorState } from './topo-2d-editor-state.svelte.ts';

describe('createTopo2DEditorState', () => {
	it('creates independent sessions with fresh document and UI state', () => {
		const first = createTopo2DEditorState();
		const second = createTopo2DEditorState();

		first.topo.routes.push({ id: 'route-1' });
		first.ui.selectedRouteId = 'route-1';

		expect(second.topo.routes).toEqual([]);
		expect(second.ui.selectedRouteId).toBeNull();
	});

	it.each(['constructor', 'load', 'loadSession'])(
		'preserves supplied topo data through %s',
		(method) => {
			const topo = {
				routes: [],
				fixPoints: [],
				outlines: [],
				textLabels: [],
				coordinates: [16, 48],
				customMetadata: { source: 'guide' }
			};
			const editor = createTopo2DEditorState(method === 'constructor' ? { topo } : {});
			if (method === 'load') editor.load(topo);
			if (method === 'loadSession') editor.loadSession({ topo });
			expect(editor.topo).toEqual(topo);
			expect(editor.topo).not.toHaveProperty('imageAspectRatio');
			expect(editor.topo).not.toBe(topo);
		}
	);

	it('loads a draft without rewriting its documents and clears stale selection', () => {
		const session = createTopo2DEditorState();
		session.ui.selectedRouteId = 'stale';

		session.loadSession(
			{
				topo: { name: 'Loaded', routes: [{ id: 'route-2' }] },
				clustering: { rawHits: [{ id: 1 }] }
			},
			'draft-1'
		);

		expect(session.topo).toEqual({ name: 'Loaded', routes: [{ id: 'route-2' }] });
		expect(session.clustering).toEqual({ rawHits: [{ id: 1 }] });
		expect(session.ui.name).toBe('');
		expect(session.topo.routes).toEqual([{ id: 'route-2' }]);
		expect(session.ui.selectedRouteId).toBeNull();
		expect(session.ui.activeDraftId).toBe('draft-1');
		expect(session.clustering.rawHits).toEqual([{ id: 1 }]);
	});
});

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopo2DEditorState } from './topo-2d-editor-state.svelte.js';

describe('createTopo2DEditorState', () => {
	it('creates independent sessions with fresh document and UI state', () => {
		const first = createTopo2DEditorState();
		const second = createTopo2DEditorState();

		first.topo.routes.push({ id: 'route-1' });
		first.ui.selectedRouteId = 'route-1';

		expect(second.topo.routes).toEqual([]);
		expect(second.ui.selectedRouteId).toBeNull();
	});

	it('loads a draft through one normalized path and clears stale selection', () => {
		const session = createTopo2DEditorState();
		session.ui.selectedRouteId = 'stale';

		session.loadSession(
			{
				topo: { name: 'Loaded', routes: [{ id: 'route-2' }] },
				clustering: { rawHits: [{ id: 1 }] }
			},
			'draft-1'
		);

		expect(session.topo.name).toBe('Loaded');
		expect(session.topo.routes).toEqual([{ id: 'route-2' }]);
		expect(session.ui.selectedRouteId).toBeNull();
		expect(session.ui.activeDraftId).toBe('draft-1');
		expect(session.clustering.rawHits).toEqual([{ id: 1 }]);
	});
});

// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { SelectTool } from './SelectTool.svelte.js';
import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';

describe('SelectTool', () => {
	it('deletes a selected fixpoint and cleans route and pitch references', () => {
		const state = createTopo2DEditorState({
			topo: {
				fixPoints: [{ id: 'fix-1' }, { id: 'fix-2' }],
				routes: [
					{
						fixPoints: ['fix-1', 'fix-2'],
						pitches: [{ startNodeId: 'fix-1', endNodeId: 'fix-2' }]
					}
				]
			}
		});
		state.selectObject('symbol', 'fix-1');
		const tool = new SelectTool(state);

		tool.onKeyDown({ key: 'Delete' });

		expect(state.topo.fixPoints).toEqual([{ id: 'fix-2' }]);
		expect(state.topo.routes[0].fixPoints).toEqual(['fix-2']);
		expect(state.topo.routes[0].pitches[0]).toEqual({ startNodeId: null, endNodeId: 'fix-2' });
		expect(state.ui.selectedFixpointId).toBeNull();
	});
});

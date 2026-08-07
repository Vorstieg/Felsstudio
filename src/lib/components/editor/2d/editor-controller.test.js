// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopo2DEditorController } from './create-topo-2d-editor-controller.svelte.js';

describe('createTopo2DEditorController', () => {
	it('keeps multi-selection and UI selection in sync', () => {
		const ui = {
			selectedRouteId: null,
			selectedFixpointId: null,
			selectedOutlineId: null,
			selectedTextLabelId: null
		};
		const topo = { fixPoints: [{ id: 'fix-1' }] };
		const controller = createTopo2DEditorController({ getTopo: () => topo, ui });

		controller.selectObject('route', 'route-1');
		controller.selectObject('symbol', 'fix-1', true);

		expect([...controller.selectedItems]).toEqual(['route:route-1', 'symbol:fix-1']);
		expect(ui.selectedRouteId).toBe('route-1');
		expect(ui.selectedFixpointId).toBe('fix-1');

		controller.selectObject('route', 'route-1', true);
		expect([...controller.selectedItems]).toEqual(['symbol:fix-1']);
		expect(ui.selectedRouteId).toBeNull();
		expect(ui.selectedFixpointId).toBe('fix-1');
	});

	it('projects the authoritative selection after removing selected data', () => {
		const ui = {
			selectedRouteId: null,
			selectedFixpointId: null,
			selectedOutlineId: null,
			selectedTextLabelId: null
		};
		const topo = {
			routes: [{ id: 'route-1' }],
			fixPoints: [{ id: 'fix-1' }],
			outlines: [],
			textLabels: []
		};
		const controller = createTopo2DEditorController({ getTopo: () => topo, ui });

		controller.selectItems([
			{ type: 'route', id: 'route-1' },
			{ type: 'symbol', id: 'fix-1' }
		]);
		topo.routes = [];
		controller.reconcileSelection();

		expect([...controller.selectedItems]).toEqual(['symbol:fix-1']);
		expect(ui.selectedRouteId).toBeNull();
		expect(ui.selectedFixpointId).toBe('fix-1');

		controller.removeItems([{ type: 'symbol', id: 'fix-1' }]);
		expect(controller.selectedItems.size).toBe(0);
		expect(ui.selectedFixpointId).toBeNull();
	});

	it('does not leave a legacy field from a previous selection', () => {
		const ui = {
			selectedRouteId: 'stale-route',
			selectedFixpointId: 'stale-fix',
			selectedOutlineId: null,
			selectedTextLabelId: null
		};
		const controller = createTopo2DEditorController({
			getTopo: () => ({ fixPoints: [{ id: 'fix-2' }] }),
			ui
		});

		controller.selectObject('symbol', 'fix-2');

		expect(ui.selectedRouteId).toBeNull();
		expect(ui.selectedFixpointId).toBe('fix-2');
	});

	it('records and completes pointer interactions', () => {
		const controller = createTopo2DEditorController({
			getTopo: () => ({ fixPoints: [] }),
			ui: {}
		});

		controller.startInteraction('move-selection', { startMouse: { x: 0.1, y: 0.2 } });
		expect(controller.interaction).toMatchObject({ kind: 'move-selection' });
		expect(controller.endInteraction()).toMatchObject({ kind: 'move-selection' });
		expect(controller.interaction).toBeNull();
	});
});

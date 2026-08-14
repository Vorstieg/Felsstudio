import { describe, expect, it, vi } from 'vitest';
import { createTopoInteractionController } from './create-topo-interaction-controller.js';

describe('createTopoInteractionController', () => {
	it('moves a marquee-selected group of route points together', () => {
		const paths = new Map([
			['0', [[0.1, 0.2]]],
			['1', [[0.4, 0.5]]]
		]);
		const editor = {
			interaction: {
				kind: 'move-points',
				startMouse: { x: 0.2, y: 0.2 },
				points: [
					{ target: { routeId: 'route', variantId: '0', index: 0 }, start: [0.1, 0.2] },
					{ target: { routeId: 'route', variantId: '1', index: 0 }, start: [0.4, 0.5] }
				]
			},
			mutateDocument: (mutator) => mutator()
		};
		const controller = createTopoInteractionController({
			editor,
			getCurrentTool: () => ({ onMouseMove: vi.fn() }),
			getEditablePath: (target) => ({
				movePoint: (index, point) => (paths.get(target.variantId)[index] = point)
			})
		});

		controller.update({ point: { x: 0.3, y: 0.4 }, sourceEvent: {} });

		expect(paths.get('0')[0][0]).toBeCloseTo(0.2);
		expect(paths.get('0')[0][1]).toBeCloseTo(0.4);
		expect(paths.get('1')[0][0]).toBeCloseTo(0.5);
		expect(paths.get('1')[0][1]).toBeCloseTo(0.7);
	});

	it('moves selected symbols and text labels from their interaction snapshot', () => {
		const topo = {
			fixPoints: [{ id: 'symbol-1', position2D: [0.1, 0.2] }],
			textLabels: [{ id: 'text-1', text: 'Label', position2D: [0.2, 0.1] }],
			routes: []
		};
		const editor = {
			topo,
			interaction: {
				kind: 'move-selection',
				startMouse: { x: 0.2, y: 0.2 },
				items: {
					paths: [],
					symbols: [{ symbolId: 'symbol-1', startPos: [0.1, 0.2] }],
					texts: [{ textId: 'text-1', startPos: [0.2, 0.1] }]
				}
			},
			mutateDocument: (mutator) => mutator()
		};
		const controller = createTopoInteractionController({
			editor,
			getCurrentTool: () => ({ onMouseMove: vi.fn() })
		});

		controller.update({ point: { x: 0.3, y: 0.5 }, sourceEvent: {} });

		expect(topo.fixPoints[0].position2D[0]).toBeCloseTo(0.2);
		expect(topo.fixPoints[0].position2D[1]).toBeCloseTo(0.5);
		expect(topo.textLabels[0].position2D[0]).toBeCloseTo(0.3);
		expect(topo.textLabels[0].position2D[1]).toBeCloseTo(0.4);
	});

	it('keeps anchor snapping available while a route edit grid is disabled', () => {
		const movePoint = vi.fn();
		const referenceFixpoint = vi.fn();
		const editor = {
			topo: { routes: [{ id: 'route-1' }] },
			interaction: { kind: 'move-point', routeId: 'route-1', pointIndex: 0 },
			mutateDocument: (mutator) => mutator()
		};
		const controller = createTopoInteractionController({
			editor,
			getCurrentTool: () => ({ onMouseMove: vi.fn() }),
			editTools: { route: { snapPoint: () => null } },
			snapRoutePoint: () => ({ point: { x: 0.4, y: 0.5 }, anchorId: 'belay-1' }),
			referenceFixpoint,
			getEditablePath: () => ({ movePoint })
		});

		controller.update({ point: { x: 0.39, y: 0.51 }, sourceEvent: {} });

		expect(movePoint).toHaveBeenCalledWith(0, [0.4, 0.5]);
		expect(referenceFixpoint).toHaveBeenCalledWith({ id: 'route-1' }, 'belay-1');
	});
});

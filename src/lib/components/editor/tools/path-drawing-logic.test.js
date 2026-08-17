import { describe, expect, it } from 'vitest';
import { createPathDrawingOptionsLogic, snapPointToGrid } from './path-drawing-logic.js';

describe('path drawing logic', () => {
	it('uses one validated grid-snapping implementation', () => {
		expect(snapPointToGrid({ x: 0.16, y: 0.24 }, { enabled: true, gridSize: 0.1 })).toEqual({
			x: 0.2,
			y: 0.2
		});
		expect(snapPointToGrid({ x: 0.16, y: 0.24 }, { enabled: false, gridSize: 0.1 })).toBeNull();
		expect(snapPointToGrid({ x: 0.16, y: 0.24 }, { enabled: true, gridSize: 0 })).toBeNull();
	});

	it('centralizes grid and curve option validation', () => {
		const gridTool = { snapToGrid: false, gridSize: 0.01 };
		const curve = { enabled: false, tension: 0.45 };
		const actions = createPathDrawingOptionsLogic({
			getGridTool: () => gridTool,
			getCurveTarget: () => curve
		});

		actions.toggleSnapToGrid();
		actions.setGridSize('0.025');
		actions.setCurveEnabled(true);
		actions.setCurveTension('0.75');
		actions.setGridSize('2');
		actions.setCurveTension('2');

		expect(gridTool).toEqual({ snapToGrid: true, gridSize: 0.025 });
		expect(curve).toEqual({ enabled: true, tension: 0.75 });
	});
});

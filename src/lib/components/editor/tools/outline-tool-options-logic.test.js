import { describe, expect, it, vi } from 'vitest';
import {
	createOutlineGridOptionsLogic,
	createOutlineToolOptionsLogic,
	createSelectedOutlineCurveLogic,
	createSelectedOutlineStyleLogic
} from './outline-tool-options-logic.js';

function createOutlineTool() {
	return {
		id: 'outline',
		snapToGrid: false,
		gridSize: 0.01,
		curveTension: 0.5,
		freehandSmoothingPx: 2,
		brushSizePx: 36,
		followPhotoEdges: true,
		setMode: vi.fn(),
		setPreset: vi.fn(),
		setFill: vi.fn(),
		clearFill: vi.fn(),
		setCurveEnabled: vi.fn()
	};
}

describe('createOutlineToolOptionsLogic', () => {
	it('routes interface actions to the active outline tool', () => {
		const tool = createOutlineTool();
		const actions = createOutlineToolOptionsLogic(() => tool);

		actions.setMode('freehand');
		actions.setPreset('slab');
		actions.setFill('rgba(1, 2, 3, 0.3)');
		actions.setFill(null);
		actions.setCurveEnabled(true);
		actions.toggleSnapToGrid();
		actions.setGridSize('0.025');
		actions.setCurveTension('0.75');
		actions.setFreehandSmoothing('4');
		actions.setBrushSize('48');
		actions.setFollowPhotoEdges(false);

		expect(tool.setMode).toHaveBeenCalledWith('freehand');
		expect(tool.setPreset).toHaveBeenCalledWith('slab');
		expect(tool.setFill).toHaveBeenCalledWith('rgba(1, 2, 3, 0.3)');
		expect(tool.clearFill).toHaveBeenCalledOnce();
		expect(tool.setCurveEnabled).toHaveBeenCalledWith(true);
		expect(tool).toMatchObject({
			snapToGrid: true,
			gridSize: 0.025,
			curveTension: 0.75,
			freehandSmoothingPx: 4,
			brushSizePx: 48,
			followPhotoEdges: false
		});
	});

	it('ignores invalid values and non-outline tools', () => {
		const tool = createOutlineTool();
		const actions = createOutlineToolOptionsLogic(() => tool);
		actions.setGridSize('not-a-number');
		actions.setCurveTension(2);
		expect(tool.gridSize).toBe(0.01);
		expect(tool.curveTension).toBe(0.5);

		const nonOutlineActions = createOutlineToolOptionsLogic(() => ({ id: 'route' }));
		expect(() => nonOutlineActions.toggleSnapToGrid()).not.toThrow();
	});

	it('shares grid behavior with an outline edit tool', () => {
		const editTool = { id: 'outlineEdit', snapToGrid: false, gridSize: 0.01 };
		const actions = createOutlineGridOptionsLogic(() => editTool, { maxGridSize: 0.25 });

		actions.toggleSnapToGrid();
		actions.setGridSize('0.2');
		actions.setGridSize('0.3');

		expect(editTool).toMatchObject({ snapToGrid: true, gridSize: 0.2 });
	});

	it('updates curve settings for the selected outline', () => {
		const updateCurve = vi.fn();
		const actions = createSelectedOutlineCurveLogic(
			() => ({ updateCurve }),
			() => 'outline-1'
		);

		actions.setCurveEnabled(true);
		actions.setCurveTension('0.75');
		actions.setCurveTension('2');

		expect(updateCurve).toHaveBeenNthCalledWith(1, 'outline-1', { enabled: true });
		expect(updateCurve).toHaveBeenNthCalledWith(2, 'outline-1', { tension: 0.75 });
		expect(updateCurve).toHaveBeenCalledTimes(2);
	});

	it('updates the selected outline type and fill color', () => {
		const updateProperties = vi.fn();
		const actions = createSelectedOutlineStyleLogic(
			() => ({ updateProperties }),
			() => 'outline-1'
		);

		actions.setLineStyle('fixedRope');
		actions.setFillColor('rgba(255, 165, 0, 0.3)');

		expect(updateProperties).toHaveBeenNthCalledWith(1, 'outline-1', {
			lineStyle: 'fixedRope'
		});
		expect(updateProperties).toHaveBeenNthCalledWith(2, 'outline-1', {
			fillColor: 'rgba(255, 165, 0, 0.3)'
		});
	});
});

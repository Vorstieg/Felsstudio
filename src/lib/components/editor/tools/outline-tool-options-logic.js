import { createGridOptionsLogic, numericValue } from './path-drawing-logic.js';

/**
 * Adapts UI intents from PathDrawingOptions to an OutlineTool.
 *
 * Keeping mutations here lets the Svelte interface remain reusable and easy
 * to exercise without a live editor tool.
 */
export function createOutlineToolOptionsLogic(getOutlineTool) {
	const withOutlineTool = (mutate) => {
		const outlineTool = getOutlineTool?.();
		if (outlineTool?.id !== 'outline') return;
		mutate(outlineTool);
	};

	return {
		setMode: (mode) => withOutlineTool((tool) => tool.setMode(mode)),
		setPreset: (preset) => withOutlineTool((tool) => tool.setPreset(preset)),
		setFill: (color) => withOutlineTool((tool) => (color ? tool.setFill(color) : tool.clearFill())),
		setCurveEnabled: (enabled) => withOutlineTool((tool) => tool.setCurveEnabled(Boolean(enabled))),
		setCurveTension: (value) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension != null) withOutlineTool((tool) => (tool.curveTension = tension));
		},
		...createOutlineGridOptionsLogic(getOutlineTool),
		setFreehandSmoothing: (value) => {
			const smoothing = numericValue(value, { min: 0, max: 8 });
			if (smoothing != null) withOutlineTool((tool) => (tool.freehandSmoothingPx = smoothing));
		},
		setBrushSize: (value) => {
			const brushSize = numericValue(value, { min: 8, max: 120 });
			if (brushSize != null) withOutlineTool((tool) => (tool.brushSizePx = brushSize));
		},
		setFollowPhotoEdges: (enabled) =>
			withOutlineTool((tool) => (tool.followPhotoEdges = Boolean(enabled)))
	};
}

/** Shared grid-snap behavior for outline creation and vertex editing. */
export function createOutlineGridOptionsLogic(getOutlineTool, { maxGridSize = 0.1 } = {}) {
	return createGridOptionsLogic(getOutlineTool, { maxGridSize });
}

/** Curve-setting behavior for the outline currently selected in Select mode. */
export function createSelectedOutlineCurveLogic(getOutlineEditTool, getSelectedOutlineId) {
	const update = (changes) => {
		const outlineId = getSelectedOutlineId?.();
		if (outlineId == null) return;
		getOutlineEditTool?.()?.updateCurve?.(outlineId, changes);
	};
	return {
		setCurveEnabled: (enabled) => update({ enabled: Boolean(enabled) }),
		setCurveTension: (value) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension != null) update({ tension });
		}
	};
}

/** Style-setting behavior for the outline currently selected in Select mode. */
export function createSelectedOutlineStyleLogic(getOutlineEditTool, getSelectedOutlineId) {
	const update = (changes) => {
		const outlineId = getSelectedOutlineId?.();
		if (outlineId == null) return;
		getOutlineEditTool?.()?.updateProperties?.(outlineId, changes);
	};
	return {
		setLineStyle: (lineStyle) => update({ lineStyle }),
		setFillColor: (fillColor) => update({ fillColor })
	};
}

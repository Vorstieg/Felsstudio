import type { OutlinePresetId } from '$lib/assets/js/outline-geometry.ts';
import { createGridOptionsLogic, numericValue } from './path-drawing-logic.ts';

type OutlineMode = 'polyline' | 'rectangle' | 'circle' | 'freehand' | 'brush' | 'preset';

type OutlineToolTarget = {
	id: string;
	snapToGrid: boolean;
	gridSize: number;
	curveTension: number;
	freehandSmoothingPx: number;
	brushSizePx: number;
	followPhotoEdges: boolean;
	setMode: (mode: OutlineMode) => void;
	setPreset: (preset: OutlinePresetId) => void;
	setFill: (color: string, opacity?: number) => void;
	clearFill: () => void;
	setCurveEnabled: (enabled: boolean) => void;
};

type OutlineEditToolTarget = {
	snapToGrid: boolean;
	gridSize: number;
	updateCurve?: (outlineId: string | number, changes: CurveChanges) => unknown;
	updateProperties?: (outlineId: string | number, changes: OutlineStyleChanges) => unknown;
};

type CurveChanges = { enabled?: boolean; tension?: number };
type OutlineStyleChanges = { lineStyle?: string; fillColor?: string | null; fillOpacity?: number };
type GridOptions = { maxGridSize?: number };
type OutlineGridTool = Pick<OutlineToolTarget, 'snapToGrid' | 'gridSize'>;

/** Actions exposed by the outline drawing options panel. */
export type OutlineToolOptionsActions = ReturnType<typeof createOutlineToolOptionsLogic>;

/** Actions exposed by the selected outline options panel. */
export type SelectedOutlineCurveActions = ReturnType<typeof createSelectedOutlineCurveLogic>;
export type SelectedOutlineStyleActions = ReturnType<typeof createSelectedOutlineStyleLogic>;

/**
 * Adapts UI intents from PathDrawingOptions to an OutlineTool.
 *
 * Keeping mutations here lets the Svelte interface remain reusable and easy
 * to exercise without a live editor tool.
 */
export function createOutlineToolOptionsLogic(
	getOutlineTool: (() => OutlineToolTarget | null | undefined) | undefined
) {
	const withOutlineTool = (mutate: (tool: OutlineToolTarget) => void): void => {
		const outlineTool = getOutlineTool?.();
		if (outlineTool?.id !== 'outline') return;
		mutate(outlineTool);
	};

	return {
		setMode: (mode: OutlineMode) => withOutlineTool((tool) => tool.setMode(mode)),
		setPreset: (preset: OutlinePresetId) => withOutlineTool((tool) => tool.setPreset(preset)),
		setFill: (color: string | null, opacity?: number) =>
			withOutlineTool((tool) => {
				if (!color) {
					tool.clearFill();
					return;
				}
				if (opacity === undefined) tool.setFill(color);
				else tool.setFill(color, opacity);
			}),
		setCurveEnabled: (enabled: boolean) =>
			withOutlineTool((tool) => tool.setCurveEnabled(Boolean(enabled))),
		setCurveTension: (value: unknown) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension != null) withOutlineTool((tool) => (tool.curveTension = tension));
		},
		...createOutlineGridOptionsLogic(getOutlineTool),
		setFreehandSmoothing: (value: unknown) => {
			const smoothing = numericValue(value, { min: 0, max: 8 });
			if (smoothing != null) withOutlineTool((tool) => (tool.freehandSmoothingPx = smoothing));
		},
		setBrushSize: (value: unknown) => {
			const brushSize = numericValue(value, { min: 8, max: 120 });
			if (brushSize != null) withOutlineTool((tool) => (tool.brushSizePx = brushSize));
		},
		setFollowPhotoEdges: (enabled: boolean) =>
			withOutlineTool((tool) => (tool.followPhotoEdges = Boolean(enabled)))
	};
}

/** Shared grid-snap behavior for outline creation and vertex editing. */
export function createOutlineGridOptionsLogic<TGrid extends OutlineGridTool>(
	getOutlineTool: (() => TGrid | null | undefined) | undefined,
	{ maxGridSize = 0.1 }: GridOptions = {}
) {
	return createGridOptionsLogic(getOutlineTool, { maxGridSize });
}

/** Curve-setting behavior for the outline currently selected in Select mode. */
export function createSelectedOutlineCurveLogic(
	getOutlineEditTool: (() => OutlineEditToolTarget | null | undefined) | undefined,
	getSelectedOutlineId: (() => string | number | null | undefined) | undefined
) {
	const update = (changes: CurveChanges): void => {
		const outlineId = getSelectedOutlineId?.();
		if (outlineId == null) return;
		getOutlineEditTool?.()?.updateCurve?.(outlineId, changes);
	};
	return {
		setCurveEnabled: (enabled: boolean) => update({ enabled: Boolean(enabled) }),
		setCurveTension: (value: unknown) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension != null) update({ tension });
		}
	};
}

/** Style-setting behavior for the outline currently selected in Select mode. */
export function createSelectedOutlineStyleLogic(
	getOutlineEditTool: (() => OutlineEditToolTarget | null | undefined) | undefined,
	getSelectedOutlineId: (() => string | number | null | undefined) | undefined
) {
	const update = (changes: OutlineStyleChanges): void => {
		const outlineId = getSelectedOutlineId?.();
		if (outlineId == null) return;
		getOutlineEditTool?.()?.updateProperties?.(outlineId, changes);
	};
	return {
		setLineStyle: (lineStyle: string) => update({ lineStyle }),
		setFillColor: (fillColor: string | null, fillOpacity?: number) =>
			update(fillOpacity === undefined ? { fillColor } : { fillColor, fillOpacity })
	};
}

import type { InteractionPoint } from '$lib/state/topo-2d-editor-interactions.ts';

type NumericBounds = { min?: number; max?: number };
type GridOptions = { enabled?: boolean; gridSize?: unknown };
type GridTool = { snapToGrid: boolean; gridSize: number };
type GridToolOptions = { maxGridSize?: number };
type CurveChanges = { enabled?: boolean; tension?: number };
type PathDrawingOptions<TGrid extends GridTool, TCurve extends object> = {
	getGridTool?: () => TGrid | null | undefined;
	getCurveTarget?: () => TCurve | null | undefined;
	updateCurve?: ((target: TCurve, changes: CurveChanges) => void) | null;
	maxGridSize?: number;
};

export function numericValue(
	value: unknown,
	{ min = -Infinity, max = Infinity }: NumericBounds = {}
): number | null {
	const number = Number(value);
	return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/** Returns a grid-aligned point, or null when grid snapping is unavailable. */
export function snapPointToGrid(
	point: InteractionPoint,
	{ enabled = false, gridSize }: GridOptions = {}
): InteractionPoint | null {
	const size = numericValue(gridSize, { min: Number.EPSILON });
	if (!enabled || size === null) return null;
	return {
		x: Math.round(point.x / size) * size,
		y: Math.round(point.y / size) * size
	};
}

/** Actions shared by the grid controls in the path-drawing option panels. */
export function createGridOptionsLogic<TGrid extends GridTool>(
	getGridTool: (() => TGrid | null | undefined) | undefined,
	{ maxGridSize = 0.1 }: GridToolOptions = {}
) {
	const withGridTool = (mutate: (tool: TGrid) => void): void => {
		const tool = getGridTool?.();
		if (tool) mutate(tool);
	};

	return {
		toggleSnapToGrid: () => withGridTool((tool) => (tool.snapToGrid = !tool.snapToGrid)),
		setGridSize: (value: unknown) => {
			const gridSize = numericValue(value, { min: 0.001, max: maxGridSize });
			if (gridSize !== null) withGridTool((tool) => (tool.gridSize = gridSize));
		}
	};
}

/** Actions shared by curve controls for route drafts and persisted route paths. */
export function createCurveOptionsLogic<TCurve extends object>(
	getCurveTarget: (() => TCurve | null | undefined) | undefined,
	updateCurve: ((target: TCurve, changes: CurveChanges) => void) | null = null
) {
	const update = (changes: CurveChanges): void => {
		const target = getCurveTarget?.();
		if (!target) return;
		if (updateCurve) updateCurve(target, changes);
		else Object.assign(target, changes);
	};

	return {
		setCurveEnabled: (enabled: boolean) => update({ enabled: Boolean(enabled) }),
		setCurveTension: (value: unknown) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension !== null) update({ tension });
		}
	};
}

export function createPathDrawingOptionsLogic<TGrid extends GridTool, TCurve extends object>({
	getGridTool,
	getCurveTarget,
	updateCurve,
	maxGridSize
}: PathDrawingOptions<TGrid, TCurve>) {
	return {
		...createGridOptionsLogic(getGridTool, { maxGridSize }),
		...createCurveOptionsLogic(getCurveTarget, updateCurve)
	};
}

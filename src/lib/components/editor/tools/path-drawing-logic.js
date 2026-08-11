export const numericValue = (value, { min = -Infinity, max = Infinity } = {}) => {
	const number = Number(value);
	return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

/** Returns a grid-aligned point, or null when grid snapping is unavailable. */
export function snapPointToGrid(point, { enabled = false, gridSize } = {}) {
	const size = numericValue(gridSize, { min: Number.EPSILON });
	if (!enabled || !size) return null;
	return {
		x: Math.round(point.x / size) * size,
		y: Math.round(point.y / size) * size
	};
}

/** Actions shared by the grid controls in the path-drawing option panels. */
export function createGridOptionsLogic(getGridTool, { maxGridSize = 0.1 } = {}) {
	const withGridTool = (mutate) => {
		const tool = getGridTool?.();
		if (!tool || !('snapToGrid' in tool) || !('gridSize' in tool)) return;
		mutate(tool);
	};

	return {
		toggleSnapToGrid: () => withGridTool((tool) => (tool.snapToGrid = !tool.snapToGrid)),
		setGridSize: (value) => {
			const gridSize = numericValue(value, { min: 0.001, max: maxGridSize });
			if (gridSize != null) withGridTool((tool) => (tool.gridSize = gridSize));
		}
	};
}

/** Actions shared by curve controls for route drafts and persisted route paths. */
export function createCurveOptionsLogic(getCurveTarget, updateCurve = null) {
	const update = (changes) => {
		const target = getCurveTarget?.();
		if (!target) return;
		if (updateCurve) updateCurve(target, changes);
		else Object.assign(target, changes);
	};

	return {
		setCurveEnabled: (enabled) => update({ enabled: Boolean(enabled) }),
		setCurveTension: (value) => {
			const tension = numericValue(value, { min: 0, max: 1 });
			if (tension != null) update({ tension });
		}
	};
}

export function createPathDrawingOptionsLogic({
	getGridTool,
	getCurveTarget,
	updateCurve,
	maxGridSize
} = {}) {
	return {
		...createGridOptionsLogic(getGridTool, { maxGridSize }),
		...createCurveOptionsLogic(getCurveTarget, updateCurve)
	};
}

import { userState } from '$lib/state/editor.svelte.js';
import { generateOutlineId } from '$lib/assets/js/id-utils.js';
import {
	CIRCLE_SEGMENTS,
	DEFAULT_FREEHAND_SMOOTHING_PX,
	FREEHAND_POINT_SPACING_PX,
	OUTLINE_SHAPE_TYPES,
	createCirclePoints,
	createOutlineRecord,
	createRectanglePoints,
	distancePx,
	normalizeCanvasSize,
	simplifyPoints
} from '$lib/assets/js/outline-geometry.js';

export const OUTLINE_STYLES = [
	{ id: 'rock', labelKey: 'ui.outline_style_rock' },
	{ id: 'approach', labelKey: 'ui.outline_style_approach' },
	{ id: 'descent', labelKey: 'ui.outline_style_descent' },
	{ id: 'variant', labelKey: 'ui.outline_style_variant' },
	{ id: 'fixedRope', labelKey: 'ui.outline_style_rope' }
];

export const OUTLINE_MODES = [
	{ id: 'polyline', labelKey: 'ui.outline_mode_polyline', icon: 'fa-draw-polygon' },
	{ id: 'rectangle', labelKey: 'ui.outline_mode_rectangle', icon: 'fa-rectangle' },
	{ id: 'circle', labelKey: 'ui.outline_mode_circle', icon: 'fa-circle' },
	{ id: 'freehand', labelKey: 'ui.outline_mode_freehand', icon: 'fa-pencil' }
];

export const OUTLINE_FILL_COLORS = [
	{ value: null, labelKey: 'ui.fill_none' },
	{ value: 'rgba(255, 165, 0, 0.3)', labelKey: 'ui.fill_orange' },
	{ value: 'rgba(139, 69, 19, 0.3)', labelKey: 'ui.fill_brown' },
	{ value: 'rgba(169, 169, 169, 0.3)', labelKey: 'ui.fill_gray' },
	{ value: 'rgba(210, 180, 140, 0.3)', labelKey: 'ui.fill_tan' },
	{ value: 'rgba(105, 105, 105, 0.3)', labelKey: 'ui.fill_dark_gray' }
];

const MIN_POINTS = 2;

function toPair(point) {
	return [point.x, point.y];
}

export class OutlineTool {
	id = 'outline';
	currentPoints = $state([]);
	selectedStyle = 'rock';
	mode = $state('polyline'); // 'polyline', 'rectangle', 'circle', 'freehand'
	isDrawing = $state(false);
	temporaryPoints = $state([]);
	startPoint = $state(null);
	centerPoint = $state(null);
	dragShape = $state(null);
	previewShape = $state(null);
	snapToGrid = $state(false);
	gridSize = 0.01; // 1% of canvas
	fillColor = $state(null);
	fillOpacity = $state(0.3);
	freehandSmoothingPx = $state(DEFAULT_FREEHAND_SMOOTHING_PX);

	constructor({ saveHistory, getCanvasSize } = {}) {
		this.saveHistory = saveHistory || (() => {});
		this.getCanvasSize = getCanvasSize || (() => ({ baseWidth: 1, baseHeight: 1 }));
	}

	onMouseDown(event, point) {
		event.stopPropagation?.();
		const nextPoint = this.normalizePoint(point);

		if (userState.ui.selectedOutlineId && this.mode === 'polyline') {
			const outline = userState.topo.outlines.find((o) => o.id === userState.ui.selectedOutlineId);
			if (outline) {
				outline.points2D = [...(outline.points2D || []), toPair(nextPoint)];
				outline.shape = {
					type: OUTLINE_SHAPE_TYPES.POLYLINE,
					points2D: outline.points2D
				};
				this.saveHistory();
				return;
			}
		}

		if (this.mode === 'polyline') {
			this.currentPoints = [...this.currentPoints, toPair(nextPoint)];
			this.saveHistory();
		} else if (this.mode === 'rectangle') {
			this.startDragShape(toPair(nextPoint));
		} else if (this.mode === 'circle') {
			this.startDragShape(toPair(nextPoint), { center: true });
		} else if (this.mode === 'freehand') {
			this.isDrawing = true;
			this.currentPoints = [toPair(nextPoint)];
		}
	}

	onMouseMove(event, point) {
		if (!this.isDrawing) return;
		const nextPoint = toPair(this.normalizePoint(point));
		this.updateDragPreview(nextPoint, event);
	}

	updateDragPreview(nextPoint, event = {}) {
		const canvasSize = this.canvasSize;
		if (this.mode === 'rectangle' && this.startPoint) {
			const points = createRectanglePoints(this.startPoint, nextPoint, {
				center: event.altKey,
				square: event.shiftKey,
				canvasSize
			});
			this.previewShape = {
				type: OUTLINE_SHAPE_TYPES.RECTANGLE,
				start2D: this.startPoint,
				end2D: nextPoint,
				fromCenter: !!event.altKey,
				square: !!event.shiftKey
			};
			this.temporaryPoints = points;
		} else if (this.mode === 'circle' && this.centerPoint) {
			const radius2D = distancePx(nextPoint, this.centerPoint, canvasSize) / canvasSize.baseWidth;
			this.previewShape = {
				type: OUTLINE_SHAPE_TYPES.CIRCLE,
				center2D: this.centerPoint,
				radius2D,
				segments: CIRCLE_SEGMENTS
			};
			this.temporaryPoints = createCirclePoints(this.centerPoint, radius2D, canvasSize);
		} else if (this.mode === 'freehand') {
			if (this.shouldAddFreehandPoint(nextPoint)) {
				this.currentPoints = [...this.currentPoints, nextPoint];
			}
		}
	}

	onMouseUp(event, point) {
		if (!this.isDrawing) return;

		if (this.mode === 'rectangle' || this.mode === 'circle') {
			this.updateDragPreview(toPair(this.normalizePoint(point)), event);
			this.commitTemporaryShape();
		} else if (this.mode === 'freehand') {
			const nextPoint = toPair(this.normalizePoint(point));
			if (this.shouldAddFreehandPoint(nextPoint)) {
				this.currentPoints = [...this.currentPoints, nextPoint];
			}
			this.currentPoints = simplifyPoints(
				this.currentPoints,
				this.freehandSmoothingPx,
				this.canvasSize
			);
			this.previewShape = {
				type: OUTLINE_SHAPE_TYPES.FREEHAND,
				points2D: this.currentPoints,
				smoothingPx: this.freehandSmoothingPx
			};
			this.commitCurrentShape();
		}
	}

	shouldAddFreehandPoint(newPoint) {
		if (this.currentPoints.length === 0) return true;

		const lastPoint = this.currentPoints[this.currentPoints.length - 1];
		return distancePx(newPoint, lastPoint, this.canvasSize) > FREEHAND_POINT_SPACING_PX;
	}

	get canvasSize() {
		return normalizeCanvasSize(this.getCanvasSize?.());
	}

	snapPointToGrid(point) {
		const snappedX = Math.round(point.x / this.gridSize) * this.gridSize;
		const snappedY = Math.round(point.y / this.gridSize) * this.gridSize;
		return { x: snappedX, y: snappedY };
	}

	normalizePoint(point) {
		return this.snapToGrid ? this.snapPointToGrid(point) : point;
	}

	startDragShape(point, { center = false } = {}) {
		this.startPoint = point;
		this.centerPoint = center ? point : null;
		this.dragShape = { type: this.mode, start2D: point };
		this.isDrawing = true;
		this.temporaryPoints = [point];
	}

	commitTemporaryShape() {
		this.currentPoints = [...this.temporaryPoints];
		this.temporaryPoints = [];
		this.commitCurrentShape();
	}

	commitCurrentShape() {
		this.isDrawing = false;
		if (this.currentPoints.length >= MIN_POINTS) {
			this.finalize();
		} else {
			this.cancel();
		}
	}

	onKeyDown(event) {
		if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') {
			this.finalize();
		} else if (event.key === 'Escape') {
			this.cancel();
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			if (this.currentPoints.length > 0) {
				this.currentPoints.pop();
				this.saveHistory();
			}
		} else if (event.key === 'c' || event.key === 'C') {
			// Close the current outline
			if (this.currentPoints.length > 2) {
				const firstPoint = this.currentPoints[0];
				if (
					this.currentPoints[this.currentPoints.length - 1][0] !== firstPoint[0] ||
					this.currentPoints[this.currentPoints.length - 1][1] !== firstPoint[1]
				) {
					this.currentPoints = [...this.currentPoints, firstPoint];
					this.saveHistory();
				}
			}
		} else if (event.key === 'g' || event.key === 'G') {
			// Toggle grid snapping
			this.snapToGrid = !this.snapToGrid;
		}
	}

	onActivate() {
		this.resetDrawingState();
	}

	onDeactivate() {
		this.resetDrawingState();
	}

	finalize() {
		if (this.currentPoints.length < MIN_POINTS) {
			console.warn('Outline needs at least 2 points');
			return;
		}

		const outlineId = generateOutlineId();
		const points2D = $state.snapshot(this.currentPoints);
		const shape =
			this.previewShape ||
			(this.mode === OUTLINE_SHAPE_TYPES.POLYLINE
				? {
						type: OUTLINE_SHAPE_TYPES.POLYLINE,
						points2D
					}
				: null);

		userState.topo.outlines.push(
			createOutlineRecord({
				id: outlineId,
				lineStyle: this.selectedStyle || 'rock',
				type: this.mode,
				points2D,
				shape: shape ? $state.snapshot(shape) : null,
				fillColor: this.fillColor,
				fillOpacity: this.fillOpacity,
				canvasSize: this.canvasSize
			})
		);

		this.resetDrawingState();
		this.saveHistory();
	}

	isClosedShape(points) {
		if (points.length < 3) return false;

		const first = points[0];
		const last = points[points.length - 1];
		return first?.[0] === last?.[0] && first?.[1] === last?.[1];
	}

	cancel() {
		this.resetDrawingState();
	}

	resetDrawingState() {
		this.currentPoints = [];
		this.temporaryPoints = [];
		this.isDrawing = false;
		this.startPoint = null;
		this.centerPoint = null;
		this.dragShape = null;
		this.previewShape = null;
	}

	// Get preview points for rendering
	getPreviewPoints() {
		if (this.temporaryPoints.length > 0) {
			return this.temporaryPoints;
		}
		return this.currentPoints;
	}

	// Set drawing mode
	setMode(mode) {
		this.mode = mode;
		this.cancel(); // Clear current drawing when changing mode
	}

	// Set fill properties
	setFill(color, opacity = 0.3) {
		this.fillColor = color;
		this.fillOpacity = opacity;
	}

	// Clear fill
	clearFill() {
		this.fillColor = null;
	}
}

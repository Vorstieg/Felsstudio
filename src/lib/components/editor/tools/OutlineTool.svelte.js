import { generateOutlineId } from '$lib/assets/js/id-utils.js';
import { createBrushOutline } from '$lib/assets/js/brush-outline-geometry.js';
import { findBrushImageEdge } from '$lib/assets/js/brush-edge-assist.js';
import {
	CIRCLE_SEGMENTS,
	DEFAULT_FREEHAND_SMOOTHING_PX,
	DEFAULT_OUTLINE_CURVE_TENSION,
	FREEHAND_POINT_SPACING_PX,
	OUTLINE_PRESETS,
	OUTLINE_SHAPE_TYPES,
	PILLAR_OUTLINE_CURVE_TENSION,
	createCirclePoints,
	createOutlineRecord,
	createPresetShape,
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
	{ id: 'freehand', labelKey: 'ui.outline_mode_freehand', icon: 'fa-pencil' },
	{ id: 'brush', labelKey: 'ui.outline_mode_brush', icon: 'fa-paintbrush' }
];

// Kept here as a UI-facing export so the options panel does not need to know
// about the geometry module directly. The shape definitions themselves live in
// outline-geometry.js.
export { OUTLINE_PRESETS };

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
	mode = $state('polyline'); // 'polyline', 'rectangle', 'circle', 'freehand', 'brush'
	preset = $state('slab');
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
	curveEnabled = $state(false);
	curveTension = $state(DEFAULT_OUTLINE_CURVE_TENSION);
	freehandSmoothingPx = $state(DEFAULT_FREEHAND_SMOOTHING_PX);
	// Diameter of the canvas brush used by the brush-to-outline assist.
	brushSizePx = $state(36);
	// When enabled, the brush assist may use visible image edges inside the painted area.
	// The outline falls back to the painted-area contour if no reliable edge is found.
	followPhotoEdges = $state(true);
	brushPoints = $state([]);
	brushOutlinePoints = $state([]);
	brushGeneration = 0;

	constructor({ state, saveHistory, getCanvasSize, getImageSrc, getImageFit } = {}) {
		this.state = state;
		this.saveHistory = saveHistory || (() => {});
		this.getCanvasSize = getCanvasSize || (() => ({ baseWidth: 1, baseHeight: 1 }));
		this.getImageSrc = getImageSrc || (() => null);
		this.getImageFit = getImageFit || (() => 'contain');
	}

	onMouseDown(event, point) {
		event.stopPropagation?.();
		const nextPoint = this.normalizePoint(point);

		if (this.state.ui.selectedOutlineId && this.mode === 'polyline') {
			const outline = this.state.topo.outlines.find((o) => o.id === this.state.ui.selectedOutlineId);
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
		} else if (this.mode === 'rectangle' || this.mode === 'preset') {
			this.startDragShape(toPair(nextPoint));
		} else if (this.mode === 'circle') {
			this.startDragShape(toPair(nextPoint), { center: true });
		} else if (this.mode === 'freehand') {
			this.isDrawing = true;
			this.currentPoints = [toPair(nextPoint)];
		} else if (this.mode === 'brush') {
			this.brushGeneration += 1;
			this.isDrawing = true;
			this.brushPoints = [toPair(nextPoint)];
			this.brushOutlinePoints = [];
		}
	}

	onMouseMove(event, point) {
		if (!this.isDrawing) return;
		const nextPoint = toPair(this.normalizePoint(point));
		this.updateDragPreview(nextPoint, event);
	}

	updateDragPreview(nextPoint, event = {}) {
		const canvasSize = this.canvasSize;
		if (this.mode === 'preset' && this.startPoint) {
			this.previewShape = createPresetShape(this.preset, this.startPoint, nextPoint);
			this.temporaryPoints = this.previewShape.points2D;
		} else if (this.mode === 'rectangle' && this.startPoint) {
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
		} else if (this.mode === 'brush') {
			if (this.shouldAddBrushPoint(nextPoint)) {
				this.brushPoints = [...this.brushPoints, nextPoint];
			}
		}
	}

	async onMouseUp(event, point) {
		if (!this.isDrawing) return;

		if (this.mode === 'rectangle' || this.mode === 'circle' || this.mode === 'preset') {
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
		} else if (this.mode === 'brush') {
			const generation = this.brushGeneration;
			const nextPoint = toPair(this.normalizePoint(point));
			if (this.shouldAddBrushPoint(nextPoint)) {
				this.brushPoints = [...this.brushPoints, nextPoint];
			}
			this.brushOutlinePoints = this.createBrushOutline();
			const fallbackPoints = this.brushOutlinePoints;
			if (fallbackPoints.length < 4) {
				this.cancel();
				return;
			}

			const edge = this.followPhotoEdges
				? await this.findBrushImageEdge([...this.brushPoints])
				: null;
			if (generation !== this.brushGeneration || this.mode !== 'brush' || !this.isDrawing) return;

			this.currentPoints = edge?.points?.length >= 2 ? edge.points : fallbackPoints;
			this.previewShape = {
				type: OUTLINE_SHAPE_TYPES.FREEHAND,
				points2D: this.currentPoints,
				brushSizePx: this.brushSizePx,
				edgeTracked: Boolean(edge)
			};
			this.commitCurrentShape();
		}
	}

	shouldAddFreehandPoint(newPoint) {
		if (this.currentPoints.length === 0) return true;

		const lastPoint = this.currentPoints[this.currentPoints.length - 1];
		return distancePx(newPoint, lastPoint, this.canvasSize) > FREEHAND_POINT_SPACING_PX;
	}

	shouldAddBrushPoint(newPoint) {
		if (this.brushPoints.length === 0) return true;
		const lastPoint = this.brushPoints[this.brushPoints.length - 1];
		return distancePx(newPoint, lastPoint, this.canvasSize) > Math.max(this.brushSizePx / 4, 2);
	}

	createBrushOutline() {
		return createBrushOutline(this.brushPoints, {
			brushRadiusPx: this.brushSizePx / 2,
			canvasSize: this.canvasSize,
			simplifyTolerancePx: this.freehandSmoothingPx
		});
	}

	async findBrushImageEdge(strokePoints) {
		const imageSrc = this.getImageSrc?.();
		if (!imageSrc || typeof Image === 'undefined') return null;
		try {
			const image = new Image();
			image.src = imageSrc;
			await image.decode();
			const maximumDimension = 1400;
			const scale = Math.min(
				1,
				maximumDimension / Math.max(image.naturalWidth, image.naturalHeight)
			);
			const width = Math.max(2, Math.round(image.naturalWidth * scale));
			const height = Math.max(2, Math.round(image.naturalHeight * scale));
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d', { willReadFrequently: true });
			if (!context) return null;
			context.drawImage(image, 0, 0, width, height);
			const canvasSize = this.canvasSize;
			const imageScale =
				this.getImageFit?.() === 'cover'
					? Math.max(canvasSize.baseWidth / width, canvasSize.baseHeight / height)
					: Math.min(canvasSize.baseWidth / width, canvasSize.baseHeight / height);
			const imagePlacement = {
				width: width * imageScale,
				height: height * imageScale,
				x: (canvasSize.baseWidth - width * imageScale) / 2,
				y: (canvasSize.baseHeight - height * imageScale) / 2
			};
			return findBrushImageEdge(context.getImageData(0, 0, width, height), strokePoints, {
				canvasSize,
				brushRadiusPx: this.brushSizePx / 2,
				imagePlacement
			});
		} catch {
			// File URLs and externally-hosted images can deny canvas pixel access.
			// The caller deliberately keeps the painted-mask outline in that case.
			return null;
		}
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
			this.undoLastPoint();
		} else if (event.key === 'c' || event.key === 'C') {
			this.closeShape();
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

		this.state.topo.outlines.push(
			createOutlineRecord({
				id: outlineId,
				lineStyle: this.selectedStyle || 'rock',
				type: this.mode,
				points2D,
				shape: shape ? $state.snapshot(shape) : null,
				// A photo-tracked edge is an open line, so it must not inherit an
				// area fill from the paint-mask fallback.
				fillColor: shape?.edgeTracked ? null : this.fillColor,
				fillOpacity: this.fillOpacity,
				curve: { enabled: this.curveEnabled, tension: this.curveTension },
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

	undoLastPoint() {
		if (this.currentPoints.length === 0) return;
		this.currentPoints = this.currentPoints.slice(0, -1);
		this.saveHistory();
	}

	closeShape() {
		if (this.currentPoints.length <= 2) return;

		const firstPoint = this.currentPoints[0];
		const lastPoint = this.currentPoints[this.currentPoints.length - 1];
		if (lastPoint?.[0] === firstPoint?.[0] && lastPoint?.[1] === firstPoint?.[1]) return;

		this.currentPoints = [...this.currentPoints, firstPoint];
		this.saveHistory();
	}

	resetDrawingState() {
		this.currentPoints = [];
		this.temporaryPoints = [];
		this.isDrawing = false;
		this.startPoint = null;
		this.centerPoint = null;
		this.dragShape = null;
		this.previewShape = null;
		this.brushPoints = [];
		this.brushOutlinePoints = [];
		this.brushGeneration += 1;
	}

	// Get preview points for rendering
	getPreviewPoints() {
		if (this.mode === 'brush') return [];
		if (this.temporaryPoints.length > 0) {
			return this.temporaryPoints;
		}
		return this.currentPoints;
	}

	getBrushPreview() {
		if (this.mode !== 'brush' || !this.isDrawing) return null;
		return {
			points: this.brushPoints,
			contourPoints: this.brushOutlinePoints,
			radiusPx: this.brushSizePx / 2
		};
	}

	// Set drawing mode
	setMode(mode) {
		this.mode = mode;
		this.cancel(); // Clear current drawing when changing mode
	}

	/** Select a standard rock silhouette and enter its press-drag placement mode. */
	setPreset(preset) {
		if (!OUTLINE_PRESETS.some((item) => item.id === preset)) return;
		this.preset = preset;
		if (preset === 'pillar' && this.curveEnabled) {
			this.curveTension = PILLAR_OUTLINE_CURVE_TENSION;
		}
		this.mode = 'preset';
		this.cancel();
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

	setCurveEnabled(enabled) {
		this.curveEnabled = enabled;
		if (enabled && this.preset === 'pillar') {
			this.curveTension = PILLAR_OUTLINE_CURVE_TENSION;
		}
	}
}

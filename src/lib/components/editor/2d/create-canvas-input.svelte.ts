import { select } from 'd3-selection';
import { zoom as d3Zoom } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';
import type { InteractionPoint } from '$lib/state/topo-2d-editor-interactions.ts';
import { vibrateOnAction } from '$lib/assets/js/mobile-utils.ts';

export type CanvasGesturePolicy = {
	panSingleTouch?: boolean;
	routeSingleTouchToInput?: boolean;
	trackEmptyTouch?: boolean;
};
export type NormalizedCanvasInput = {
	point: InteractionPoint;
	sourceEvent: Event;
	button: number;
	shiftKey: boolean;
	isTouch: boolean;
};
export type NormalizedTouchInput = Omit<NormalizedCanvasInput, 'sourceEvent'> & {
	sourceEvent: Touch;
};
export type CanvasInputHandlers = {
	down?: (input: NormalizedCanvasInput | null) => unknown;
	move?: (input: NormalizedCanvasInput | null) => unknown;
	up?: (input: NormalizedCanvasInput | null) => unknown;
	emptyTouchTap?: () => unknown;
};
export type CanvasInputOptions = {
	getAspectRatio: () => number;
	getGesturePolicy: () => CanvasGesturePolicy;
	onInput: CanvasInputHandlers;
};
type LastPointerEvent = { time: number; x: number; y: number };
type EmptyTouch = { id: number; x: number; y: number; moved: boolean };

const COMPAT_MOUSE_SUPPRESSION_MS = 1500;
const COMPAT_MOUSE_SUPPRESSION_PX = 30;

/**
 * Owns the browser-facing part of the 2D canvas: D3 zoom, viewport-to-topo
 * conversion, and the mouse/touch event lifecycle. Consumers only receive
 * normalized topo points and keep their domain editing behaviour separate.
 */
export function createCanvasInput({
	getAspectRatio,
	getGesturePolicy,
	onInput
}: CanvasInputOptions) {
	let svgElement = $state<SVGSVGElement | null>(null);
	let contentElement = $state<SVGGElement | null>(null);
	let transform = $state<ZoomTransform | { x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
	let baseWidth = $state(1000);
	let baseHeight = $state(667);
	let activeTouchId = $state<number | null>(null);
	let activePointerId = $state<number | null>(null);
	let emptyTouch: EmptyTouch | null = null;
	let lastPointerInputEvent: LastPointerEvent | null = null;
	let removeListeners: (() => void) | null = null;

	function updateDimensions() {
		if (!svgElement) return;
		const rect = svgElement.getBoundingClientRect();
		const requestedRatio = Number(getAspectRatio());
		const viewportRatio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1.5;
		const ratio =
			Number.isFinite(requestedRatio) && requestedRatio > 0 ? requestedRatio : viewportRatio;
		baseWidth = 1000;
		baseHeight = 1000 / ratio;
	}

	function normalizeEvent(sourceEvent: Event, touch?: Touch | null): NormalizedCanvasInput | null;
	function normalizeEvent(sourceEvent: Touch, touch?: Touch | null): NormalizedTouchInput | null;
	function normalizeEvent(
		sourceEvent: Event | Touch,
		touch: Touch | null = null
	): NormalizedCanvasInput | NormalizedTouchInput | null {
		if (!svgElement) return null;
		const source = touch || sourceEvent;
		if (!('clientX' in source) || !('clientY' in source)) return null;

		const screenPoint = svgElement.createSVGPoint();
		screenPoint.x = source.clientX;
		screenPoint.y = source.clientY;
		const matrix = svgElement.getScreenCTM();
		if (!matrix) return null;
		const svgPoint = screenPoint.matrixTransform(matrix.inverse());
		const x = (svgPoint.x - transform.x) / transform.k;
		const y = (svgPoint.y - transform.y) / transform.k;

		const normalized = {
			point: { x: x / baseWidth, y: y / baseHeight },
			button:
				'button' in sourceEvent && typeof sourceEvent.button === 'number' ? sourceEvent.button : 0,
			shiftKey: 'shiftKey' in sourceEvent ? Boolean(sourceEvent.shiftKey) : false,
			isTouch: Boolean(touch)
		};
		return 'preventDefault' in sourceEvent
			? { ...normalized, sourceEvent }
			: { ...normalized, sourceEvent };
	}

	function updateTransform(nextTransform: ZoomTransform) {
		transform = nextTransform;
		select(contentElement).attr(
			'transform',
			`translate(${nextTransform.x},${nextTransform.y}) scale(${nextTransform.k})`
		);
	}

	function install() {
		const svg = svgElement;
		if (!svg || !contentElement) return;
		updateDimensions();

		const behavior = d3Zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 5])
			.translateExtent([
				[-baseWidth * 0.5, -baseHeight * 0.5],
				[baseWidth * 1.5, baseHeight * 1.5]
			])
			.extent([
				[0, 0],
				[baseWidth, baseHeight]
			])
			.wheelDelta(
				(event) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002)
			)
			.duration(0)
			.constrain((nextTransform) => nextTransform)
			.filter((event) => {
				if (event.type === 'wheel') return true;
				if (event.type.startsWith('touch')) {
					return (
						event.touches?.length >= 2 ||
						(event.touches?.length === 1 && Boolean(getGesturePolicy?.().panSingleTouch))
					);
				}
				return false;
			})
			.touchable(() => true)
			.on('zoom', (event) => updateTransform(event.transform));

		select(svg).call(behavior);

		const captureOptions = { passive: false, capture: true };
		const startedOnEditControl = (event: Event) =>
			(event.target as Element | null)?.closest?.(
				'.symbol-group, .text-label-group, .text-composer, .route-container, .route-label, .route-point-hit-area, .route-point-handle, .route-midpoint-hit-area, .route-midpoint, .editable-path-point-hit-area, .editable-path-point-handle, .editable-path-midpoint-hit-area, .editable-path-midpoint, .outline-hit-area, .outline-semantic-hit-area, .gizmo'
			);
		const markPointerInput = (event: PointerEvent | Touch) => {
			lastPointerInputEvent = { time: Date.now(), x: event.clientX, y: event.clientY };
		};
		const isCompatibilityMouseEvent = (event: MouseEvent) => {
			const last = lastPointerInputEvent;
			if (!last || Date.now() - last.time > COMPAT_MOUSE_SUPPRESSION_MS) return false;
			const dx = Number(event.clientX) - Number(last.x);
			const dy = Number(event.clientY) - Number(last.y);
			return (
				Number.isFinite(dx) &&
				Number.isFinite(dy) &&
				Math.hypot(dx, dy) < COMPAT_MOUSE_SUPPRESSION_PX
			);
		};
		const suppressCompatibilityMouseDown = (event: MouseEvent) => {
			if (!isCompatibilityMouseEvent(event)) return;
			// Compatibility mouse events are dispatched after touch/pen events and would
			// otherwise reach SVG child handlers first (e.g. midpoint insertion) before
			// bubbling to this canvas listener. Capture and stop them at the canvas edge.
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();
		};
		const handleMouseDown = (event: MouseEvent) => {
			if (isCompatibilityMouseEvent(event)) {
				event.preventDefault();
				return;
			}
			onInput?.down?.(normalizeEvent(event));
		};
		const handleMouseMove = (event: MouseEvent) => {
			if (isCompatibilityMouseEvent(event)) return;
			onInput?.move?.(normalizeEvent(event));
		};
		const handleMouseUp = (event: MouseEvent) => {
			if (isCompatibilityMouseEvent(event)) return;
			onInput?.up?.(normalizeEvent(event));
		};
		const isDirectPointer = (event: PointerEvent) =>
			event.pointerType === 'pen' || event.pointerType === 'touch';
		const handlePointerDown = (event: PointerEvent) => {
			// Pens often do not emit a full mousemove compatibility stream while dragging.
			// Touch edit controls also route through Pointer Events on some browsers.
			if (!isDirectPointer(event)) return;
			if (startedOnEditControl(event)) return;
			markPointerInput(event);
			if (event.pointerType === 'touch') return;
			event.preventDefault();
			activePointerId = event.pointerId;
			svg.setPointerCapture?.(event.pointerId);
			onInput?.down?.(normalizeEvent(event));
		};
		const handlePointerMove = (event: PointerEvent) => {
			if (!isDirectPointer(event) || event.pointerId !== activePointerId) return;
			event.preventDefault();
			onInput?.move?.(normalizeEvent(event));
		};
		const handlePointerUp = (event: PointerEvent) => {
			if (!isDirectPointer(event) || event.pointerId !== activePointerId) return;
			event.preventDefault();
			onInput?.up?.(normalizeEvent(event));
			svg.releasePointerCapture?.(event.pointerId);
			activePointerId = null;
		};
		const handleTouchStart = (event: TouchEvent) => {
			const policy = getGesturePolicy?.() || {};
			if (event.touches.length >= 2) {
				event.preventDefault();
				return;
			}
			if (event.touches.length !== 1) return;
			if (policy.trackEmptyTouch) {
				if (startedOnEditControl(event)) return;
				const touch = event.touches[0];
				emptyTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY, moved: false };
				return;
			}
			if (!policy.routeSingleTouchToInput) {
				return;
			}
			event.preventDefault();
			activeTouchId = event.touches[0].identifier;
			markPointerInput(event.touches[0]);
			onInput?.down?.(normalizeEvent(event, event.touches[0]));
			vibrateOnAction('selection');
		};
		const handleTouchMove = (event: TouchEvent) => {
			const policy = getGesturePolicy?.() || {};
			const pendingEmptyTouch = emptyTouch;
			if (pendingEmptyTouch) {
				const touch = Array.from(event.touches).find(
					(item) => item.identifier === pendingEmptyTouch.id
				);
				if (
					touch &&
					Math.hypot(touch.clientX - pendingEmptyTouch.x, touch.clientY - pendingEmptyTouch.y) > 8
				) {
					pendingEmptyTouch.moved = true;
				}
			}
			if (event.touches.length >= 2) {
				if (emptyTouch) emptyTouch.moved = true;
				event.preventDefault();
				return;
			}
			const touch = Array.from(event.touches).find((item) => item.identifier === activeTouchId);
			if (!touch && policy.routeSingleTouchToInput) {
				const selectionTouch = event.touches[0];
				if (selectionTouch) onInput?.move?.(normalizeEvent(event, selectionTouch));
				return;
			}
			if (!touch) return;
			event.preventDefault();
			onInput?.move?.(normalizeEvent(event, touch));
		};
		const handleTouchEnd = (event: TouchEvent) => {
			const pendingEmptyTouch = emptyTouch;
			if (pendingEmptyTouch) {
				const touchEnded = Array.from(event.changedTouches).some(
					(item) => item.identifier === pendingEmptyTouch.id
				);
				if (touchEnded) {
					if (!pendingEmptyTouch.moved) onInput?.emptyTouchTap?.();
					emptyTouch = null;
					return;
				}
			}
			if (getGesturePolicy?.().routeSingleTouchToInput && activeTouchId === null) {
				const touch = event.changedTouches[0];
				if (touch) onInput?.up?.(normalizeEvent(event, touch));
				return;
			}
			if (activeTouchId === null) return;
			if (Array.from(event.touches).some((item) => item.identifier === activeTouchId)) return;
			const touch = Array.from(event.changedTouches).find(
				(item) => item.identifier === activeTouchId
			);
			if (touch) onInput?.up?.(normalizeEvent(event, touch));
			activeTouchId = null;
		};

		svg.addEventListener('mousedown', suppressCompatibilityMouseDown, true);
		svg.addEventListener('mousedown', handleMouseDown);
		svg.addEventListener('mousemove', handleMouseMove);
		svg.addEventListener('mouseup', handleMouseUp);
		svg.addEventListener('mouseleave', handleMouseUp);
		svg.addEventListener('pointerdown', handlePointerDown);
		svg.addEventListener('pointermove', handlePointerMove);
		svg.addEventListener('pointerup', handlePointerUp);
		svg.addEventListener('pointercancel', handlePointerUp);
		// Capture these before D3 zoom so empty taps survive D3's touch-end handling.
		svg.addEventListener('touchstart', handleTouchStart, captureOptions);
		svg.addEventListener('touchmove', handleTouchMove, captureOptions);
		svg.addEventListener('touchend', handleTouchEnd, captureOptions);
		svg.addEventListener('touchcancel', handleTouchEnd, captureOptions);

		removeListeners = () => {
			select(svg).on('.zoom', null);
			svg.removeEventListener('mousedown', suppressCompatibilityMouseDown, true);
			svg.removeEventListener('mousedown', handleMouseDown);
			svg.removeEventListener('mousemove', handleMouseMove);
			svg.removeEventListener('mouseup', handleMouseUp);
			svg.removeEventListener('mouseleave', handleMouseUp);
			svg.removeEventListener('pointerdown', handlePointerDown);
			svg.removeEventListener('pointermove', handlePointerMove);
			svg.removeEventListener('pointerup', handlePointerUp);
			svg.removeEventListener('pointercancel', handlePointerUp);
			svg.removeEventListener('touchstart', handleTouchStart, captureOptions);
			svg.removeEventListener('touchmove', handleTouchMove, captureOptions);
			svg.removeEventListener('touchend', handleTouchEnd, captureOptions);
			svg.removeEventListener('touchcancel', handleTouchEnd, captureOptions);
		};
	}

	function setElements({
		svg,
		content
	}: {
		svg: SVGSVGElement | null;
		content: SVGGElement | null;
	}) {
		removeListeners?.();
		svgElement = svg;
		contentElement = content;
		if (svg && content) install();
	}

	function trackTouch(touch: Touch | null | undefined) {
		activeTouchId = touch?.identifier ?? null;
		if (touch?.clientX != null && touch?.clientY != null) {
			lastPointerInputEvent = { time: Date.now(), x: touch.clientX, y: touch.clientY };
		}
	}

	function trackPointer(event: PointerEvent | null | undefined) {
		activePointerId = event?.pointerId ?? null;
		if (event?.clientX != null && event?.clientY != null) {
			lastPointerInputEvent = { time: Date.now(), x: event.clientX, y: event.clientY };
		}
		if (activePointerId != null) svgElement?.setPointerCapture?.(activePointerId);
	}

	function refreshDimensions() {
		updateDimensions();
	}

	function destroy() {
		removeListeners?.();
		removeListeners = null;
	}

	return {
		get baseWidth() {
			return baseWidth;
		},
		get baseHeight() {
			return baseHeight;
		},
		get transform() {
			return transform;
		},
		get activeTouchId() {
			return activeTouchId;
		},
		setElements,
		trackTouch,
		trackPointer,
		normalizeEvent,
		refreshDimensions,
		destroy
	};
}

export type CanvasInput = ReturnType<typeof createCanvasInput>;

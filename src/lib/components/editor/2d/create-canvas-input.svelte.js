import { select } from 'd3-selection';
import { zoom as d3Zoom } from 'd3-zoom';
import { vibrateOnAction } from '$lib/assets/js/mobile-utils.ts';

const COMPAT_MOUSE_SUPPRESSION_MS = 1500;
const COMPAT_MOUSE_SUPPRESSION_PX = 30;

/**
 * Owns the browser-facing part of the 2D canvas: D3 zoom, viewport-to-topo
 * conversion, and the mouse/touch event lifecycle. Consumers only receive
 * normalized topo points and keep their domain editing behaviour separate.
 */
export function createCanvasInput({ getAspectRatio, getGesturePolicy, onInput }) {
	let svgElement = $state(null);
	let contentElement = $state(null);
	let transform = $state({ x: 0, y: 0, k: 1 });
	let baseWidth = $state(1000);
	let baseHeight = $state(667);
	let activeTouchId = $state(null);
	let activePointerId = $state(null);
	let emptyTouch = null;
	let lastPointerInputEvent = null;
	let zoomBehavior = null;
	let removeListeners = null;

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

	function normalizeEvent(sourceEvent, touch = null) {
		if (!svgElement) return null;
		const source = touch || sourceEvent;
		if (!source || source.clientX == null || source.clientY == null) return null;

		const screenPoint = svgElement.createSVGPoint();
		screenPoint.x = source.clientX;
		screenPoint.y = source.clientY;
		const svgPoint = screenPoint.matrixTransform(svgElement.getScreenCTM().inverse());
		const x = (svgPoint.x - transform.x) / transform.k;
		const y = (svgPoint.y - transform.y) / transform.k;

		return {
			point: { x: x / baseWidth, y: y / baseHeight },
			sourceEvent,
			button: sourceEvent.button ?? 0,
			shiftKey: Boolean(sourceEvent.shiftKey),
			isTouch: Boolean(touch)
		};
	}

	function updateTransform(nextTransform) {
		transform = nextTransform;
		select(contentElement).attr(
			'transform',
			`translate(${nextTransform.x},${nextTransform.y}) scale(${nextTransform.k})`
		);
	}

	function install() {
		if (!svgElement || !contentElement) return;
		updateDimensions();

		zoomBehavior = d3Zoom()
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
			.interpolate(() => (t) => t)
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

		select(svgElement).call(zoomBehavior);

		const captureOptions = { passive: false, capture: true };
		const startedOnEditControl = (event) =>
			event.target?.closest?.(
				'.symbol-group, .text-label-group, .text-composer, .route-container, .route-label, .route-point-hit-area, .route-point-handle, .route-midpoint-hit-area, .route-midpoint, .editable-path-point-hit-area, .editable-path-point-handle, .editable-path-midpoint-hit-area, .editable-path-midpoint, .outline-hit-area, .outline-semantic-hit-area, .gizmo'
			);
		const markPointerInput = (event) => {
			lastPointerInputEvent = { time: Date.now(), x: event.clientX, y: event.clientY };
		};
		const isCompatibilityMouseEvent = (event) => {
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
		const suppressCompatibilityMouseDown = (event) => {
			if (!isCompatibilityMouseEvent(event)) return;
			// Compatibility mouse events are dispatched after touch/pen events and would
			// otherwise reach SVG child handlers first (e.g. midpoint insertion) before
			// bubbling to this canvas listener. Capture and stop them at the canvas edge.
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();
		};
		const handleMouseDown = (event) => {
			if (isCompatibilityMouseEvent(event)) {
				event.preventDefault();
				return;
			}
			onInput?.down?.(normalizeEvent(event));
		};
		const handleMouseMove = (event) => {
			if (isCompatibilityMouseEvent(event)) return;
			onInput?.move?.(normalizeEvent(event));
		};
		const handleMouseUp = (event) => {
			if (isCompatibilityMouseEvent(event)) return;
			onInput?.up?.(normalizeEvent(event));
		};
		const isDirectPointer = (event) => event.pointerType === 'pen' || event.pointerType === 'touch';
		const handlePointerDown = (event) => {
			// Pens often do not emit a full mousemove compatibility stream while dragging.
			// Touch edit controls also route through Pointer Events on some browsers.
			if (!isDirectPointer(event)) return;
			if (startedOnEditControl(event)) return;
			markPointerInput(event);
			if (event.pointerType === 'touch') return;
			event.preventDefault();
			activePointerId = event.pointerId;
			svgElement.setPointerCapture?.(event.pointerId);
			onInput?.down?.(normalizeEvent(event));
		};
		const handlePointerMove = (event) => {
			if (!isDirectPointer(event) || event.pointerId !== activePointerId) return;
			event.preventDefault();
			onInput?.move?.(normalizeEvent(event));
		};
		const handlePointerUp = (event) => {
			if (!isDirectPointer(event) || event.pointerId !== activePointerId) return;
			event.preventDefault();
			onInput?.up?.(normalizeEvent(event));
			svgElement.releasePointerCapture?.(event.pointerId);
			activePointerId = null;
		};
		const handleTouchStart = (event) => {
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
		const handleTouchMove = (event) => {
			const policy = getGesturePolicy?.() || {};
			if (emptyTouch) {
				const touch = Array.from(event.touches).find((item) => item.identifier === emptyTouch.id);
				if (touch && Math.hypot(touch.clientX - emptyTouch.x, touch.clientY - emptyTouch.y) > 8) {
					emptyTouch.moved = true;
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
		const handleTouchEnd = (event) => {
			if (emptyTouch) {
				const touchEnded = Array.from(event.changedTouches).some(
					(item) => item.identifier === emptyTouch.id
				);
				if (touchEnded) {
					if (!emptyTouch.moved) onInput?.emptyTouchTap?.();
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

		svgElement.addEventListener('mousedown', suppressCompatibilityMouseDown, true);
		svgElement.addEventListener('mousedown', handleMouseDown);
		svgElement.addEventListener('mousemove', handleMouseMove);
		svgElement.addEventListener('mouseup', handleMouseUp);
		svgElement.addEventListener('mouseleave', handleMouseUp);
		svgElement.addEventListener('pointerdown', handlePointerDown);
		svgElement.addEventListener('pointermove', handlePointerMove);
		svgElement.addEventListener('pointerup', handlePointerUp);
		svgElement.addEventListener('pointercancel', handlePointerUp);
		// Capture these before D3 zoom so empty taps survive D3's touch-end handling.
		svgElement.addEventListener('touchstart', handleTouchStart, captureOptions);
		svgElement.addEventListener('touchmove', handleTouchMove, captureOptions);
		svgElement.addEventListener('touchend', handleTouchEnd, captureOptions);
		svgElement.addEventListener('touchcancel', handleTouchEnd, captureOptions);

		removeListeners = () => {
			select(svgElement).on('.zoom', null);
			svgElement.removeEventListener('mousedown', suppressCompatibilityMouseDown, true);
			svgElement.removeEventListener('mousedown', handleMouseDown);
			svgElement.removeEventListener('mousemove', handleMouseMove);
			svgElement.removeEventListener('mouseup', handleMouseUp);
			svgElement.removeEventListener('mouseleave', handleMouseUp);
			svgElement.removeEventListener('pointerdown', handlePointerDown);
			svgElement.removeEventListener('pointermove', handlePointerMove);
			svgElement.removeEventListener('pointerup', handlePointerUp);
			svgElement.removeEventListener('pointercancel', handlePointerUp);
			svgElement.removeEventListener('touchstart', handleTouchStart, captureOptions);
			svgElement.removeEventListener('touchmove', handleTouchMove, captureOptions);
			svgElement.removeEventListener('touchend', handleTouchEnd, captureOptions);
			svgElement.removeEventListener('touchcancel', handleTouchEnd, captureOptions);
		};
	}

	function setElements({ svg, content }) {
		removeListeners?.();
		svgElement = svg;
		contentElement = content;
		if (svg && content) install();
	}

	function trackTouch(touch) {
		activeTouchId = touch?.identifier ?? null;
		if (touch?.clientX != null && touch?.clientY != null) {
			lastPointerInputEvent = { time: Date.now(), x: touch.clientX, y: touch.clientY };
		}
	}

	function trackPointer(event) {
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

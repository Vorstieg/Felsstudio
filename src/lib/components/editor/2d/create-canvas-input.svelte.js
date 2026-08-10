import { select } from 'd3-selection';
import { zoom as d3Zoom } from 'd3-zoom';
import { vibrateOnAction } from '$lib/assets/js/mobile-utils.js';

/**
 * Owns the browser-facing part of the 2D canvas: D3 zoom, viewport-to-topo
 * conversion, and the mouse/touch event lifecycle. Consumers only receive
 * normalized topo points and keep their domain editing behaviour separate.
 */
export function createCanvasInput({
	getActiveTool,
	getAspectRatio,
	getMobileSelectionMode,
	onDown,
	onMove,
	onUp,
	onEmptyTouchTap
}) {
	let svgElement = $state(null);
	let contentElement = $state(null);
	let transform = $state({ x: 0, y: 0, k: 1 });
	let baseWidth = $state(1000);
	let baseHeight = $state(667);
	let activeTouchId = $state(null);
	let emptyTouch = null;
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
						((['symbolEdit', 'routeEdit', 'outlineEdit'].includes(getActiveTool()) ||
							(getActiveTool() === 'select' && !getMobileSelectionMode?.())) &&
							event.touches?.length === 1)
					);
				}
				return false;
			})
			.touchable(() => true)
			.on('zoom', (event) => updateTransform(event.transform));

		select(svgElement).call(zoomBehavior);

		const options = { passive: false };
		const captureOptions = { passive: false, capture: true };
		const startedOnEditControl = (event) =>
			event.target?.closest?.(
				'.symbol-group, .text-label-group, .text-composer, .route-container, .route-label, .route-point-hit-area, .route-point-handle, .route-midpoint-hit-area, .route-midpoint, .editable-path-point-hit-area, .editable-path-point-handle, .editable-path-midpoint-hit-area, .editable-path-midpoint, .outline-hit-area, .gizmo'
			);
		const handleMouseDown = (event) => onDown?.(normalizeEvent(event));
		const handleMouseMove = (event) => onMove?.(normalizeEvent(event));
		const handleMouseUp = (event) => onUp?.(normalizeEvent(event));
		const handleTouchStart = (event) => {
			if (event.touches.length >= 2) {
				event.preventDefault();
				return;
			}
			if (event.touches.length !== 1) return;
			if (['symbolEdit', 'routeEdit', 'outlineEdit'].includes(getActiveTool())) {
				if (startedOnEditControl(event)) return;
				const touch = event.touches[0];
				emptyTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY, moved: false };
				return;
			}
			if (getActiveTool() === 'select') {
				if (getMobileSelectionMode?.()) onDown?.(normalizeEvent(event, event.touches[0]));
				return;
			}
			event.preventDefault();
			activeTouchId = event.touches[0].identifier;
			onDown?.(normalizeEvent(event, event.touches[0]));
			vibrateOnAction('selection');
		};
		const handleTouchMove = (event) => {
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
			if (!touch && getActiveTool() === 'select' && getMobileSelectionMode?.()) {
				const selectionTouch = event.touches[0];
				if (selectionTouch) onMove?.(normalizeEvent(event, selectionTouch));
				return;
			}
			if (!touch) return;
			event.preventDefault();
			onMove?.(normalizeEvent(event, touch));
		};
		const handleTouchEnd = (event) => {
			if (emptyTouch) {
				const touchEnded = Array.from(event.changedTouches).some(
					(item) => item.identifier === emptyTouch.id
				);
				if (touchEnded) {
					if (!emptyTouch.moved) onEmptyTouchTap?.();
					emptyTouch = null;
					return;
				}
			}
			if (getActiveTool() === 'select' && getMobileSelectionMode?.()) {
				const touch = event.changedTouches[0];
				if (touch) onUp?.(normalizeEvent(event, touch));
				return;
			}
			if (activeTouchId === null) return;
			if (Array.from(event.touches).some((item) => item.identifier === activeTouchId)) return;
			const touch = Array.from(event.changedTouches).find(
				(item) => item.identifier === activeTouchId
			);
			if (touch) onUp?.(normalizeEvent(event, touch));
			activeTouchId = null;
		};

		svgElement.addEventListener('mousedown', handleMouseDown);
		svgElement.addEventListener('mousemove', handleMouseMove);
		svgElement.addEventListener('mouseup', handleMouseUp);
		svgElement.addEventListener('mouseleave', handleMouseUp);
		// Capture these before D3 zoom so empty taps survive D3's touch-end handling.
		svgElement.addEventListener('touchstart', handleTouchStart, captureOptions);
		svgElement.addEventListener('touchmove', handleTouchMove, captureOptions);
		svgElement.addEventListener('touchend', handleTouchEnd, captureOptions);
		svgElement.addEventListener('touchcancel', handleTouchEnd, captureOptions);

		removeListeners = () => {
			select(svgElement).on('.zoom', null);
			svgElement.removeEventListener('mousedown', handleMouseDown);
			svgElement.removeEventListener('mousemove', handleMouseMove);
			svgElement.removeEventListener('mouseup', handleMouseUp);
			svgElement.removeEventListener('mouseleave', handleMouseUp);
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
		normalizeEvent,
		refreshDimensions,
		destroy
	};
}

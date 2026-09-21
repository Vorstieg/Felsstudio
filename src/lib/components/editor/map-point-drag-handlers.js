export function initMapPointDragHandlers({
	map,
	layers = [],
	canDrag = () => true,
	getDragState = () => null,
	onDragStart = () => {},
	onDragMove = () => {},
	onDragEnd = () => {},
	onDragCancel = () => {}
}) {
	if (!map) return () => {};
	let draggingState = null;
	let pendingMoveEvent = null;
	let moveFrame = null;
	let dragPanWasEnabled = true;
	let touchZoomWasEnabled = true;
	let draggingWithTouch = false;
	const cleanups = [];

	function scheduleMove(event) {
		pendingMoveEvent = event;
		if (moveFrame !== null) return;
		moveFrame = requestAnimationFrame(() => {
			moveFrame = null;
			if (!draggingState || !pendingMoveEvent) return;
			const moveEvent = pendingMoveEvent;
			pendingMoveEvent = null;
			onDragMove(draggingState, moveEvent);
		});
	}

	function addMapHandler(...args) {
		map.on(...args);
		cleanups.push(() => map.off(...args));
	}

	function startDrag(event, layerId, { touch = false } = {}) {
		if (!canDrag(event, layerId)) return;
		const nextState = getDragState(event, layerId);
		if (!nextState) return;
		if (touch) {
			event.originalEvent?.stopPropagation?.();
		} else {
			event.preventDefault();
		}
		draggingState = nextState;
		if (onDragStart(draggingState, event, layerId) === false) {
			draggingState = null;
			return;
		}
		dragPanWasEnabled = map.dragPan?.isEnabled?.() ?? true;
		touchZoomWasEnabled = map.touchZoomRotate?.isEnabled?.() ?? true;
		draggingWithTouch = touch;
		map.dragPan?.disable();
		if (touch) map.touchZoomRotate?.disable();
		map.getCanvas().style.cursor = 'move';
	}

	function restoreMapGestures(touch) {
		if (dragPanWasEnabled) map.dragPan?.enable();
		else map.dragPan?.disable();
		if (touch) {
			if (touchZoomWasEnabled) map.touchZoomRotate?.enable();
			else map.touchZoomRotate?.disable();
		}
	}

	function finishDrag(event, { touch = false, cancelled = false } = {}) {
		if (!draggingState) return;
		if (moveFrame !== null) {
			cancelAnimationFrame(moveFrame);
			moveFrame = null;
		}
		if (pendingMoveEvent) {
			const moveEvent = pendingMoveEvent;
			pendingMoveEvent = null;
			onDragMove(draggingState, moveEvent);
		}
		const finishedState = draggingState;
		draggingState = null;
		try {
			if (cancelled) onDragCancel(finishedState, event);
			else onDragEnd(finishedState, event);
		} finally {
			restoreMapGestures(touch);
			draggingWithTouch = false;
			map.getCanvas().style.cursor = '';
		}
	}

	for (const layerId of layers) {
		addMapHandler('mouseenter', layerId, () => {
			if (canDrag()) map.getCanvas().style.cursor = 'move';
		});
		addMapHandler('mouseleave', layerId, () => {
			if (!draggingState) map.getCanvas().style.cursor = '';
		});
		addMapHandler('mousedown', layerId, (event) => startDrag(event, layerId));
		addMapHandler('touchstart', layerId, (event) => startDrag(event, layerId, { touch: true }));
	}

	addMapHandler('mousemove', (event) => {
		if (!draggingState) return;
		scheduleMove(event);
	});

	addMapHandler('touchmove', (event) => {
		if (!draggingState) return;
		event.originalEvent?.stopPropagation?.();
		scheduleMove(event);
	});

	addMapHandler('mouseup', (event) => finishDrag(event));
	addMapHandler('touchend', (event) => finishDrag(event, { touch: true }));
	addMapHandler('touchcancel', (event) => finishDrag(event, { touch: true, cancelled: true }));

	return () => {
		if (draggingState) {
			onDragCancel(draggingState);
			draggingState = null;
			restoreMapGestures(draggingWithTouch);
			draggingWithTouch = false;
		}
		if (moveFrame !== null) cancelAnimationFrame(moveFrame);
		pendingMoveEvent = null;
		for (const cleanup of cleanups) cleanup();
	};
}

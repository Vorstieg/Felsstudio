import type {
	Map as MapLibreMap,
	MapLayerMouseEvent,
	MapLayerTouchEvent,
	MapMouseEvent,
	MapTouchEvent
} from 'maplibre-gl';

type LayerEvent = MapLayerMouseEvent | MapLayerTouchEvent;
type DragEvent = MapMouseEvent | MapTouchEvent;
type MapGestureHandler = { disable: () => void; enable: () => void; isEnabled?: () => boolean };
type DragMap = Pick<MapLibreMap, 'on' | 'off' | 'getCanvas'> & {
	dragPan?: MapGestureHandler;
	touchZoomRotate?: MapGestureHandler;
};
type MapPointDragOptions<TDragState = unknown> = {
	map: DragMap | null | undefined;
	layers?: string[];
	canDrag?: (event?: LayerEvent, layerId?: string) => boolean;
	getDragState?: (event: LayerEvent, layerId: string) => TDragState | null | undefined;
	onDragStart?: (state: TDragState, event: LayerEvent, layerId: string) => boolean | void;
	onDragMove?: (state: TDragState, event: DragEvent) => void;
	onDragEnd?: (state: TDragState, event: DragEvent) => void;
	onDragCancel?: (state: TDragState, event?: DragEvent) => void;
};

export function initMapPointDragHandlers<TDragState = unknown>({
	map,
	layers = [],
	canDrag = () => true,
	getDragState = () => null,
	onDragStart = () => {},
	onDragMove = () => {},
	onDragEnd = () => {},
	onDragCancel = () => {}
}: MapPointDragOptions<TDragState>): () => void {
	if (!map) return () => {};
	const dragMap = map;
	let draggingState: TDragState | null | undefined = null;
	let pendingMoveEvent: DragEvent | null = null;
	let moveFrame: number | null = null;
	let dragPanWasEnabled = true;
	let touchZoomWasEnabled = true;
	let draggingWithTouch = false;
	const cleanups: Array<() => void> = [];

	function scheduleMove(event: DragEvent) {
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

	function addMapHandler(type: string, layerId: string, handler: (event: LayerEvent) => void): void;
	function addMapHandler(type: string, handler: (event: DragEvent) => void): void;
	function addMapHandler(
		type: string,
		layerOrHandler: string | ((event: LayerEvent | DragEvent) => void),
		layerHandler?: (event: LayerEvent) => void
	) {
		if (typeof layerOrHandler === 'string' && layerHandler) {
			dragMap.on(type as 'mousedown', layerOrHandler, layerHandler);
			cleanups.push(() => dragMap.off(type as 'mousedown', layerOrHandler, layerHandler));
			return;
		}
		const handler = layerOrHandler as (event: DragEvent) => void;
		dragMap.on(type as 'mousemove', handler);
		cleanups.push(() => dragMap.off(type as 'mousemove', handler));
	}

	function startDrag(
		event: LayerEvent,
		layerId: string,
		{ touch = false }: { touch?: boolean } = {}
	) {
		if (!canDrag(event, layerId)) return;
		const nextState = getDragState(event, layerId);
		if (nextState == null) return;
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
		dragPanWasEnabled = dragMap.dragPan?.isEnabled?.() ?? true;
		touchZoomWasEnabled = dragMap.touchZoomRotate?.isEnabled?.() ?? true;
		draggingWithTouch = touch;
		dragMap.dragPan?.disable();
		if (touch) dragMap.touchZoomRotate?.disable();
		dragMap.getCanvas().style.cursor = 'move';
	}

	function restoreMapGestures(touch: boolean) {
		if (dragPanWasEnabled) dragMap.dragPan?.enable();
		else dragMap.dragPan?.disable();
		if (touch) {
			if (touchZoomWasEnabled) dragMap.touchZoomRotate?.enable();
			else dragMap.touchZoomRotate?.disable();
		}
	}

	function finishDrag(
		event: DragEvent,
		{ touch = false, cancelled = false }: { touch?: boolean; cancelled?: boolean } = {}
	) {
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
			dragMap.getCanvas().style.cursor = '';
		}
	}

	for (const layerId of layers) {
		addMapHandler('mouseenter', layerId, () => {
			if (canDrag()) dragMap.getCanvas().style.cursor = 'move';
		});
		addMapHandler('mouseleave', layerId, () => {
			if (!draggingState) dragMap.getCanvas().style.cursor = '';
		});
		addMapHandler('mousedown', layerId, (event) => startDrag(event as MapLayerMouseEvent, layerId));
		addMapHandler('touchstart', layerId, (event) =>
			startDrag(event as MapLayerTouchEvent, layerId, { touch: true })
		);
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

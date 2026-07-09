export function initMapPointDragHandlers({
	map,
	layers = [],
	canDrag = () => true,
	getDragState = () => null,
	onDragStart = () => {},
	onDragMove = () => {},
	onDragEnd = () => {}
}) {
	if (!map) return () => {};
	let draggingState = null;
	const cleanups = [];

	function addMapHandler(...args) {
		map.on(...args);
		cleanups.push(() => map.off(...args));
	}

	for (const layerId of layers) {
		addMapHandler('mouseenter', layerId, () => {
			if (canDrag()) map.getCanvas().style.cursor = 'move';
		});
		addMapHandler('mouseleave', layerId, () => {
			if (!draggingState) map.getCanvas().style.cursor = '';
		});
		addMapHandler('mousedown', layerId, (event) => {
			if (!canDrag(event, layerId)) return;
			const nextState = getDragState(event, layerId);
			if (!nextState) return;
			event.preventDefault();
			draggingState = nextState;
			onDragStart(draggingState, event, layerId);
			map.dragPan.disable();
			map.getCanvas().style.cursor = 'move';
		});
	}

	addMapHandler('mousemove', (event) => {
		if (!draggingState) return;
		onDragMove(draggingState, event);
	});

	addMapHandler('mouseup', (event) => {
		if (!draggingState) return;
		const finishedState = draggingState;
		draggingState = null;
		onDragEnd(finishedState, event);
		map.dragPan.enable();
		map.getCanvas().style.cursor = '';
	});

	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}

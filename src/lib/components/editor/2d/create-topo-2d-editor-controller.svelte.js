/**
 * State that describes an editing session, rather than the topo itself.
 *
 * Keeping this separate from the SVG/D3 code gives every input path (mouse,
 * touch, keyboard and toolbar) the same selection and interaction model.
 */
export function createTopo2DEditorController({ getTopo, ui }) {
	let selectedItems = $state(new Set());
	let selectedSymbolInstance = $state(null);
	let interaction = $state(null);

	function clearUiSelection() {
		ui.selectedRouteId = null;
		ui.selectedFixpointId = null;
		ui.selectedOutlineId = null;
		ui.selectedTextLabelId = null;
	}

	function clearSelection() {
		selectedItems.clear();
		syncUiSelection();
	}

	function syncUiSelection() {
		clearUiSelection();
		selectedSymbolInstance = null;
		for (const itemKey of selectedItems) {
			const [type, id] = itemKey.split(':');
			if (type === 'route') ui.selectedRouteId = id;
			if (type === 'outline') ui.selectedOutlineId = id;
			if (type === 'text') ui.selectedTextLabelId = id;
			if (type === 'symbol') {
				ui.selectedFixpointId = id;
				selectedSymbolInstance = getTopo().fixPoints.find((symbol) => symbol.id === id) || null;
			}
		}
	}

	function selectedId(type) {
		let id = null;
		for (const itemKey of selectedItems) {
			const [itemType, itemId] = itemKey.split(':');
			if (itemType === type) id = itemId;
		}
		return id;
	}

	function isSelected(type, id) {
		return selectedItems.has(`${type}:${id}`);
	}

	function selectObject(type, id, multi = false) {
		if (!multi) clearSelection();

		const itemKey = `${type}:${id}`;
		if (multi && selectedItems.has(itemKey)) {
			selectedItems.delete(itemKey);
			syncUiSelection();
			return;
		}

		selectedItems.add(itemKey);
		syncUiSelection();
	}

	function selectItems(items, mode = 'replace') {
		if (mode === 'replace') selectedItems.clear();
		items.forEach(({ type, id }) => {
			const key = `${type}:${id}`;
			if (mode === 'subtract') selectedItems.delete(key);
			else selectedItems.add(key);
		});
		syncUiSelection();
	}

	function removeItems(items) {
		for (const { type, id } of items) selectedItems.delete(`${type}:${id}`);
		syncUiSelection();
	}

	function reconcileSelection() {
		const topo = getTopo();
		const existing = {
			route: new Set((topo.routes || []).map((item) => item.id)),
			symbol: new Set((topo.fixPoints || []).map((item) => item.id)),
			outline: new Set((topo.outlines || []).map((item) => item.id)),
			text: new Set((topo.textLabels || []).map((item) => item.id))
		};
		for (const itemKey of selectedItems) {
			const [type, id] = itemKey.split(':');
			if (!existing[type]?.has(id)) selectedItems.delete(itemKey);
		}
		syncUiSelection();
	}

	function startInteraction(kind, details) {
		interaction = { kind, ...details };
	}

	function endInteraction() {
		const finished = interaction;
		interaction = null;
		return finished;
	}

	return {
		get selectedItems() {
			// Selection changes must go through the controller so the compatibility
			// fields and selected symbol instance are always projected together.
			return new Set(selectedItems);
		},
		get selectedSymbolInstance() {
			return selectedSymbolInstance;
		},
		get interaction() {
			return interaction;
		},
		clearSelection,
		selectedId,
		isSelected,
		selectObject,
		selectItems,
		removeItems,
		reconcileSelection,
		startInteraction,
		endInteraction
	};
}

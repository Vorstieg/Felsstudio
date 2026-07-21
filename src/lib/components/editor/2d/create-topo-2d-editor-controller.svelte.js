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
		clearUiSelection();
		selectedSymbolInstance = null;
		selectedItems.clear();
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
		if (type === 'route') ui.selectedRouteId = id;
		if (type === 'outline') ui.selectedOutlineId = id;
		if (type === 'text') ui.selectedTextLabelId = id;
		if (type === 'symbol') {
			ui.selectedFixpointId = id;
			selectedSymbolInstance = getTopo().fixPoints.find((symbol) => symbol.id === id) || null;
		}
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
			return selectedItems;
		},
		get selectedSymbolInstance() {
			return selectedSymbolInstance;
		},
		set selectedSymbolInstance(value) {
			selectedSymbolInstance = value;
		},
		get interaction() {
			return interaction;
		},
		clearSelection,
		isSelected,
		selectObject,
		selectItems,
		startInteraction,
		endInteraction
	};
}

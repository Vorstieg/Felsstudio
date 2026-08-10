export class SelectTool {
	id = 'select';
	constructor({ context, state, saveHistory, getSelectedId, removeItems, deleteSymbols } = {}) {
		this.state = state;
		this.saveHistory =
			context?.commands?.commit || context?.history?.save || saveHistory || (() => {});
		this.getSelectedId = getSelectedId || (() => this.state.ui.selectedFixpointId);
		this.removeItems =
			removeItems ||
			((items) => {
				if (
					items.some(({ type, id }) => type === 'symbol' && id === this.state.ui.selectedFixpointId)
				) {
					this.state.ui.selectedFixpointId = null;
				}
			});
		this.getSelectedId =
			context?.selection?.selectedId || getSelectedId || (() => this.state.ui.selectedFixpointId);
		this.removeItems = context?.selection?.removeItems || this.removeItems;
		this.deleteSymbols = context?.commands?.deleteSymbols || deleteSymbols || null;
	}

	onMouseDown(event, point) {
		// Select tool just delegates to generic hit testing or is handled by Topo2DEditor's global click handlers
		// for selecting routes/outlines which I kept in Topo2DEditor helpers (handleRouteClick etc).
		// But clicking empty space deselects.
		// Topo2DEditor's handleSVGClick delegated to tool.
		// So I should handle deselection here?
		// Or Topo2DEditor handled it BEFORE tool?
		// My Topo2DEditor refactor: "1. Handle Deselection first ... 2. Handle Tool Actions -> currentTool.onMouseDown"
		// So deselection of symbols/routes is handled in Topo2DEditor before calling this.
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {
		if (event.key === 'Delete' || event.key === 'Backspace') {
			const idToDelete = this.getSelectedId('symbol');
			if (idToDelete) {
				if (this.deleteSymbols) this.deleteSymbols([idToDelete]);
				else {
					this.state.topo.fixPoints = this.state.topo.fixPoints.filter((p) => p.id !== idToDelete);
					this.state.topo.routes.forEach((route) => {
						route.fixPoints = (route.fixPoints || []).filter((id) => id !== idToDelete);
						(route.pitches || []).forEach((pitch) => {
							if (pitch.startNodeId === idToDelete) pitch.startNodeId = null;
							if (pitch.endNodeId === idToDelete) pitch.endNodeId = null;
						});
					});
				}
				if (!this.deleteSymbols) this.removeItems([{ type: 'symbol', id: idToDelete }]);
				if (!this.deleteSymbols) this.saveHistory();
			}
		}
	}
	onActivate() {}
	onDeactivate() {}
}

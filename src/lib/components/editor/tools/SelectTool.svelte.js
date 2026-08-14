export class SelectTool {
	id = 'select';
	constructor(editor) {
		this.state = editor;
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
			const idToDelete = this.state.selectedId('symbol');
			if (idToDelete) {
				this.state.deleteSymbols([idToDelete]);
			}
		}
	}
	onActivate() {}
	onDeactivate() {}
}

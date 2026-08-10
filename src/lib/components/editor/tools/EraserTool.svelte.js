export class EraserTool {
	id = 'eraser';

	constructor({ context, state, saveHistory, deleteSymbolAt } = {}) {
		this.state = state;
		this.saveHistory =
			context?.commands?.commit || context?.history?.save || saveHistory || (() => {});
		this.deleteSymbolAt = context?.commands?.deleteSymbolAt || deleteSymbolAt || null;
	}

	onMouseDown(event, point) {
		if (this.deleteSymbolAt) {
			this.deleteSymbolAt(point);
			return;
		}

		// Compatibility fallback for isolated consumers that construct the tool
		// without the editor command context.
		const clickedSymbol = this.state.topo.fixPoints.find((s) => {
			if (!s.position2D) return false;
			const dx = Math.abs(s.position2D[0] - point.x);
			const dy = Math.abs(s.position2D[1] - point.y);
			return dx < 0.02 && dy < 0.02; // Tolerance
		});
		if (clickedSymbol) {
			this.state.topo.fixPoints = this.state.topo.fixPoints.filter(
				(s) => s.id !== clickedSymbol.id
			);
			this.saveHistory();
		}
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {}
	onActivate() {}
	onDeactivate() {}
}

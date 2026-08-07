export class SymbolTool {
	id = 'symbol';
	// No state needed for symbol tool currently as it places on click

	constructor({ context, state, saveHistory } = {}) {
		this.state = state;
		this.saveHistory =
			context?.history?.save || context?.commands?.commit || saveHistory || (() => {});
		this.createSymbol = context?.commands?.createSymbol || null;
	}

	selectedType = 'bolt';

	onMouseDown(event, point) {
		if (this.createSymbol) {
			this.createSymbol(point, this.selectedType);
			return;
		}
		this.state.createSymbol(point, this.selectedType);
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {}
	onActivate() {}
	onDeactivate() {}
}

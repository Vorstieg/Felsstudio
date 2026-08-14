export class SymbolTool {
	id = 'symbol';
	// No state needed for symbol tool currently as it places on click

	constructor(editor) {
		this.state = editor;
	}

	selectedType = 'bolt';

	onMouseDown(event, point) {
		this.state.createSymbol(point, this.selectedType);
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {}
	onActivate() {}
	onDeactivate() {}
}

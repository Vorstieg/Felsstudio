export class SymbolTool {
	id = 'symbol';
	// No state needed for symbol tool currently as it places on click

	constructor(editor) {
		this.state = editor;
	}

	selectedType = 'bolt';

	onMouseDown(_event, point) {
		this.state.createSymbol(point, this.selectedType);
	}

	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}

import { generateId } from '$lib/assets/js/id-utils.js';

export class TextTool {
	id = 'text';

	constructor({ state, saveHistory, beginTextEdit } = {}) {
		this.state = state;
		this.saveHistory = saveHistory || (() => {});
		this.beginTextEdit = beginTextEdit || (() => {});
	}

	onMouseDown(event, point) {
		event.stopPropagation();
		const id = generateId('text');

		if (!this.state.topo.textLabels) this.state.topo.textLabels = [];
		this.state.topo.textLabels.push({
			id,
			text: 'Text',
			position2D: [point.x, point.y],
			fontSize2D: 0.025,
			color: '#23201d',
			fontWeight: 700
		});
		this.state.ui.selectedTextLabelId = id;
		this.saveHistory();
		this.beginTextEdit(id);
	}

	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}

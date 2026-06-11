import { userState } from '$lib/state/editor.svelte.js';
import { generateId } from '$lib/assets/js/id-utils.js';

export class TextTool {
	id = 'text';

	constructor({ saveHistory, beginTextEdit } = {}) {
		this.saveHistory = saveHistory || (() => {});
		this.beginTextEdit = beginTextEdit || (() => {});
	}

	onMouseDown(event, point) {
		event.stopPropagation();
		const id = generateId('text');

		if (!userState.topo.textLabels) userState.topo.textLabels = [];
		userState.topo.textLabels.push({
			id,
			text: 'Text',
			position2D: [point.x, point.y],
			fontSize2D: 0.025,
			color: '#23201d',
			fontWeight: 700
		});
		userState.ui.selectedTextLabelId = id;
		this.saveHistory();
		this.beginTextEdit(id);
	}

	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}

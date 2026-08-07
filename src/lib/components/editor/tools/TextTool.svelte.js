export class TextTool {
	id = 'text';
	editingId = $state(null);
	editingValue = $state('');
	editingOriginalValue = $state('');

	constructor({
		context,
		state,
		saveHistory,
		selectObject,
		removeItems,
		createTextLabel,
		deleteTextLabel
	} = {}) {
		this.state = state;
		if (state?.drafts?.text) {
			const draft = state.drafts.text;
			Object.defineProperties(this, {
				editingId: {
					configurable: true,
					get: () => draft.id,
					set: (value) => {
						draft.id = value;
					}
				},
				editingValue: {
					configurable: true,
					get: () => draft.value,
					set: (value) => {
						draft.value = value;
					}
				},
				editingOriginalValue: {
					configurable: true,
					get: () => draft.originalValue,
					set: (value) => {
						draft.originalValue = value;
					}
				}
			});
		}
		this.saveHistory =
			context?.history?.save || context?.commands?.commit || saveHistory || (() => {});
		this.selectObject = context?.selection?.selectObject || selectObject || (() => {});
		this.removeItems = context?.selection?.removeItems || removeItems || (() => {});
		this.createTextLabel = context?.commands?.createTextLabel || createTextLabel || null;
		this.updateTextLabel = context?.commands?.updateTextLabel || null;
		this.deleteTextLabel = context?.commands?.deleteTextLabels
			? (id) => context.commands.deleteTextLabels([id])
			: deleteTextLabel || null;
	}

	onMouseDown(event, point) {
		event.stopPropagation();
		const id = this.createTextLabel
			? this.createTextLabel(point)
			: this.createLegacyTextLabel(point);
		this.beginEdit(id);
	}

	beginEdit(id) {
		const label = this.getLabel(id);
		if (!label) return false;
		this.editingId = id;
		this.editingValue = label.text || '';
		this.editingOriginalValue = label.text || '';
		this.selectObject('text', id);
		return true;
	}

	setValue(value) {
		this.editingValue = value;
	}

	commitEdit() {
		if (!this.editingId) return false;
		const id = this.editingId;
		const nextValue = this.editingValue.trim();
		const changed = nextValue !== this.editingOriginalValue;

		if (changed) {
			if (nextValue) {
				if (this.updateTextLabel) this.updateTextLabel(id, nextValue);
				else {
					const label = this.getLabel(id);
					if (label) label.text = nextValue;
					this.saveHistory();
				}
			} else if (this.deleteTextLabel) {
				this.deleteTextLabel(id);
			} else {
				this.state.topo.textLabels = (this.state.topo.textLabels || []).filter(
					(label) => label.id !== id
				);
				this.removeItems([{ type: 'text', id }]);
				this.saveHistory();
			}
		}

		this.resetEdit();
		return changed;
	}

	cancelEdit() {
		if (!this.editingId) return false;
		const label = this.getLabel(this.editingId);
		if (label) label.text = this.editingOriginalValue;
		this.resetEdit();
		return true;
	}

	handleEditKeyDown(event) {
		event.stopPropagation();
		if (event.key === 'Enter') {
			event.preventDefault();
			this.commitEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			this.cancelEdit();
		}
	}

	getLabel(id) {
		return this.state.topo.textLabels?.find((label) => label.id === id);
	}

	resetEdit() {
		this.editingId = null;
		this.editingValue = '';
		this.editingOriginalValue = '';
	}

	createLegacyTextLabel(point) {
		const id = this.state.createTextLabel(point);
		this.selectObject('text', id);
		return id;
	}

	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}

export function createRouteEditController({
	getSelection,
	getDraft,
	commitDraft,
	setSelection,
	setDraft
}) {
	function selectionKey(value) {
		return value ? JSON.stringify(value) : null;
	}

	function commitActiveDraft() {
		if (getDraft()) commitDraft();
	}

	function selectObject(nextObject) {
		if (selectionKey(getSelection()) !== selectionKey(nextObject)) commitActiveDraft();
		setSelection(nextObject);
	}

	function startDraft(nextDraft) {
		commitActiveDraft();
		setDraft(nextDraft);
	}

	return { commitActiveDraft, selectObject, startDraft };
}

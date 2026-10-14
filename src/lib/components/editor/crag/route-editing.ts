type RouteEditSelection = Record<string, string | number>;

/** Selection and target changes apply valid edits through the shared tool policy. */
export function createRouteEditController<Selection extends RouteEditSelection, Draft>({
	getSelection,
	requestLeave,
	setSelection,
	setDraft
}: {
	getSelection: () => Selection | null;
	requestLeave: (next: () => void) => void;
	setSelection: (selection: Selection | null) => void;
	setDraft: (draft: Draft | null) => void;
}) {
	function selectObject(next: Selection | null) {
		if (JSON.stringify(getSelection()) === JSON.stringify(next)) return;
		requestLeave(() => setSelection(next));
	}
	function startDraft(next: Draft | null) {
		requestLeave(() => setDraft(next));
	}
	return { selectObject, startDraft };
}

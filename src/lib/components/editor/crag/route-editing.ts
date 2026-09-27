type RouteEditSelection = Record<string, string | number>;

type RouteEditControllerOptions<Selection extends RouteEditSelection, Draft> = {
	getSelection: () => Selection | null;
	getDraft: () => Draft | null;
	commitDraft: () => void;
	setSelection: (selection: Selection | null) => void;
	setDraft: (draft: Draft | null) => void;
};

/** Coordinates route selection changes with the active route draft. */
export function createRouteEditController<Selection extends RouteEditSelection, Draft>({
	getSelection,
	getDraft,
	commitDraft,
	setSelection,
	setDraft
}: RouteEditControllerOptions<Selection, Draft>) {
	function selectionKey(value: Selection | null): string | null {
		return value ? JSON.stringify(value) : null;
	}

	function commitActiveDraft(): void {
		if (getDraft()) commitDraft();
	}

	function selectObject(nextObject: Selection | null): void {
		if (selectionKey(getSelection()) !== selectionKey(nextObject)) commitActiveDraft();
		setSelection(nextObject);
	}

	function startDraft(nextDraft: Draft | null): void {
		commitActiveDraft();
		setDraft(nextDraft);
	}

	return { commitActiveDraft, selectObject, startDraft };
}

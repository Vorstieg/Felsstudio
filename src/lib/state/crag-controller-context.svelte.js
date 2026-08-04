import { getContext, setContext } from 'svelte';

export const CRAG_EDITOR_CONTROLLER = Symbol('crag-editor-controller');

export function provideCragEditorController(controller) {
	setContext(CRAG_EDITOR_CONTROLLER, controller);
	return controller;
}

export function getCragEditorController() {
	const controller = getContext(CRAG_EDITOR_CONTROLLER);
	if (!controller) throw new Error('Crag editor controller is not available in this component tree');
	return controller;
}

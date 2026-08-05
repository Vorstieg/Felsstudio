import { getContext, setContext } from 'svelte';

export const CRAG_EDITOR_TOOLS = Symbol('crag-editor-tools');

export function provideCragEditorTools(tools) {
	setContext(CRAG_EDITOR_TOOLS, tools);
	return tools;
}

export function getCragEditorTools() {
	const tools = getContext(CRAG_EDITOR_TOOLS);
	if (!tools) throw new Error('Crag editor tools are not available in this component tree');
	return tools;
}

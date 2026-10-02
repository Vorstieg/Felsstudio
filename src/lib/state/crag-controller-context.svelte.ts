import { getContext, setContext } from 'svelte';
import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';
import type { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.ts';
import type { useCragGeometryEditor } from '$lib/components/editor/crag/use-crag-geometry-editor.svelte.ts';
import type { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.ts';
import type { createCragSectorTool } from '$lib/components/editor/crag/CragSectorTool.svelte.ts';
import type { createCragRouteTool } from '$lib/components/editor/crag/CragRouteTool.svelte.ts';
import type { CragSelection } from '$lib/components/editor/crag/crag-route-types.ts';

export const CRAG_EDITOR_TOOLS = Symbol('crag-editor-tools');

export type CragEditorTools = {
	trackEditor: ReturnType<typeof useCragTrackEditor>;
	sectorTool: ReturnType<typeof createCragSectorTool>;
	geometryEditor: ReturnType<typeof useCragGeometryEditor>;
	routeTool: ReturnType<typeof createCragRouteTool>;
	accessEditor: ReturnType<typeof useCragAccessEditor>;
	actions: {
		back: () => void;
		startTrackCut: () => void;
		confirmTrackCut: () => void;
		cancelTrackCut: () => void;
		undo: () => boolean;
		redo: () => boolean;
		export: () => Promise<void>;
		centerMapOnUser: () => void;
		addCragImages: (files?: File[]) => void;
		removeCragImage: (index: number) => void;
		addEquipmentItem: () => void;
		removeEquipmentItem: (index: number) => void;
		setActiveMetadataId: (value: string) => void;
		selectObject: (selection: CragSelection | null) => Promise<void>;
		selectMetadataTarget: (
			target: string | null,
			options?: { focus?: boolean; edit?: boolean }
		) => Promise<void>;
		handleFlightPlanGenerated: (plan: FlightPlan | null) => void;
	};
};

export function provideCragEditorTools(tools: CragEditorTools): CragEditorTools {
	setContext(CRAG_EDITOR_TOOLS, tools);
	return tools;
}

export function getCragEditorTools(): CragEditorTools {
	const tools = getContext<CragEditorTools | undefined>(CRAG_EDITOR_TOOLS);
	if (!tools) throw new Error('Crag editor tools are not available in this component tree');
	return tools;
}

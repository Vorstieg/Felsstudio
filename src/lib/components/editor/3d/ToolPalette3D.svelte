<script lang="ts">
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';
	import { _ } from 'svelte-i18n';
	import type { Topo2DEditorClustering } from '$lib/state/topo-2d-editor-initial-state.ts';
	import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';

	type Point2D = [number, number];
	type Props = {
		activeTool?: string | null;
		toolOptionsOpen?: boolean;
		drawingTarget?: TopoDrawingTarget | null;
		lassoPoints: Point2D[];
		saveStatus: 'idle' | 'success' | 'error';
		saveError: string;
		combinedExport: () => void | Promise<void>;
		onUndo?: (() => void) | null;
		onRedo?: (() => void) | null;
		clustering: Topo2DEditorClustering;
	};

	let {
		activeTool = $bindable(null),
		toolOptionsOpen = $bindable(true),
		drawingTarget = $bindable(null),
		lassoPoints = $bindable(),
		saveStatus,
		saveError,
		combinedExport,
		onUndo = null,
		onRedo = null,
		clustering = $bindable()
	}: Props = $props();
</script>

<ToolBar
	bind:activeTool
	bind:toolOptionsOpen
	neutralTool=""
	tools={[
		{
			id: 'ai-bolts',
			icon: 'fa-wand-magic-sparkles',
			label: $_('ui.ai-bolts'),
			hidden: !(clustering.rawHits.length > 0),
			onSelect: () => {
				drawingTarget = null;
			}
		},
		{
			id: 'route',
			icon: 'fa-route',
			label: $_('ui.route'),
			hasOptions: true,
			onSelect: () => {
				drawingTarget = null;
			}
		},
		{
			id: 'multipitch',
			icon: 'fa-timeline',
			label: $_('ui.multipitch'),
			hasOptions: true,
			onSelect: () => {
				drawingTarget = null;
			}
		},
		{
			id: 'fixpoint',
			icon: 'fa-circle-dot',
			label: $_('ui.fixpoint'),
			hasOptions: true,
			onSelect: () => {
				drawingTarget = null;
			}
		},
		{
			id: 'crop',
			icon: 'fa-scissors',
			label: $_('ui.crop'),
			hasOptions: true,
			onSelect: () => {
				drawingTarget = null;
				lassoPoints = [];
			}
		}
	]}
	undo={onUndo ? { label: `${$_('ui.undo_desc')} (Ctrl+Z)`, run: onUndo } : null}
	redo={onRedo ? { label: `${$_('ui.redo_desc')} (Ctrl+Y)`, run: onRedo } : null}
	save={{ status: saveStatus, errorMessage: saveError, run: combinedExport }}
>
	{#snippet controls()}
		<label
			class="hidden cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 hover:bg-black/5 xl:flex"
		>
			<input
				type="checkbox"
				bind:checked={clustering.showCameraTrail}
				class="h-3.5 w-3.5 rounded-sm border border-black/15 text-creator-blue"
			/>
			<span class="text-ui-label text-warm-gray-500">{$_('ui.show_camera_trail')}</span>
		</label>
	{/snippet}
</ToolBar>

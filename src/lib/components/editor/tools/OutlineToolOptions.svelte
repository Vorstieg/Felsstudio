<script>
	import { _ } from 'svelte-i18n';
	import {
		OUTLINE_FILL_COLORS,
		OUTLINE_MODES,
		OUTLINE_PRESETS,
		OUTLINE_STYLES
	} from '$lib/components/editor/tools/OutlineTool.svelte.js';
	import ToolOptions from './ToolOptions.svelte';
	import PathDrawingOptions from './PathDrawingOptions.svelte';
	import { createOutlineToolOptionsLogic } from './outline-tool-options-logic.js';

	let {
		outlineTool = null,
		selectedOutlineStyle = $bindable('rock'),
		onClose = () => {}
	} = $props();

	const actions = createOutlineToolOptionsLogic(() => outlineTool);
</script>

{#if outlineTool?.id === 'outline'}
	<ToolOptions title={$_('ui.outline_tool_options')} open={true} {onClose}>
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium text-warm-gray-600">{$_('ui.drawing_mode')}</p>
			<div class="grid grid-cols-4 gap-1">
				{#each OUTLINE_MODES as mode}
					<button
						type="button"
						class="flex flex-col items-center gap-1 p-2 rounded-sm transition-none {outlineTool.mode === mode.id
							? 'bg-creator-blue text-white'
							: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}"
						onclick={() => actions.setMode(mode.id)}
						title={$_(mode.labelKey)}
					>
						<i class="fas {mode.icon} text-sm"></i>
						<span class="text-[9px] font-medium leading-tight text-center max-w-full break-words">{$_(mode.labelKey)}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if selectedOutlineStyle === 'rock'}
			<div class="flex flex-col gap-2">
				<p class="text-xs font-medium text-warm-gray-600">{$_('ui.rock_presets')}</p>
				<div class="grid grid-cols-5 gap-1">
					{#each OUTLINE_PRESETS as preset}
						<button
							type="button"
							class="flex min-h-13 flex-col items-center justify-center gap-1 rounded-sm p-1.5 transition-none {outlineTool.mode === 'preset' && outlineTool.preset === preset.id
								? 'bg-creator-blue text-white'
								: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}"
							onclick={() => actions.setPreset(preset.id)}
							title={$_(preset.labelKey)}
							aria-label={$_(preset.labelKey)}
						>
							<i class="fas {preset.icon} text-sm"></i>
							<span class="text-[9px] font-medium leading-tight">{$_(preset.labelKey)}</span>
						</button>
					{/each}
				</div>
				<p class="text-micro-data text-warm-gray-500">{$_('ui.rock_preset_hint')}</p>
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<label for="outline-line-style" class="text-xs font-medium text-warm-gray-600">{$_('ui.line_style')}</label>
			<select
				id="outline-line-style"
				value={selectedOutlineStyle}
				onchange={(event) => (selectedOutlineStyle = event.currentTarget.value)}
				class="h-8 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none"
			>
				{#each OUTLINE_STYLES as style}
					<option value={style.id}>{$_(style.labelKey)}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium text-warm-gray-600">{$_('ui.fill_color')}</p>
			<div class="grid grid-cols-6 gap-1">
				{#each OUTLINE_FILL_COLORS as color}
					<button
						type="button"
						class="w-6 h-6 rounded-sm transition-none {outlineTool.fillColor === color.value ? 'shadow-[inset_0_0_0_2px_var(--color-creator-blue)]' : ''}"
						style="background-color: {color.value || 'transparent'}; border: 1px solid #e5e7eb;"
						onclick={() => actions.setFill(color.value)}
						title={$_(color.labelKey)}
					></button>
				{/each}
			</div>
		</div>

		<PathDrawingOptions
			snapToGrid={outlineTool.snapToGrid}
			gridSize={outlineTool.gridSize}
			curveEnabled={outlineTool.curveEnabled}
			curveTension={outlineTool.curveTension}
			onToggleSnapToGrid={actions.toggleSnapToGrid}
			onGridSizeChange={actions.setGridSize}
			onCurveEnabledChange={actions.setCurveEnabled}
			onCurveTensionChange={actions.setCurveTension}
		/>

		{#if outlineTool.mode === 'freehand'}
			<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
				<span class="w-20">{$_('ui.smoothing')}</span>
				<input type="range" min="0" max="8" step="0.5" value={outlineTool.freehandSmoothingPx} oninput={(event) => actions.setFreehandSmoothing(event.currentTarget.value)} class="min-w-0 flex-1" />
				<span class="w-8 text-right">{outlineTool.freehandSmoothingPx}px</span>
			</label>
		{:else if outlineTool.mode === 'brush'}
			<div class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<span class="w-20">{$_('ui.brush_size')}</span>
					<input type="range" min="8" max="120" step="2" value={outlineTool.brushSizePx} oninput={(event) => actions.setBrushSize(event.currentTarget.value)} class="min-w-0 flex-1" />
					<span class="w-10 text-right">{outlineTool.brushSizePx}px</span>
				</label>
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<input type="checkbox" checked={outlineTool.followPhotoEdges} onchange={(event) => actions.setFollowPhotoEdges(event.currentTarget.checked)} class="h-4 w-4 rounded border-black/20 text-creator-blue focus:ring-creator-blue" />
					<span>{$_('ui.follow_photo_edges')}</span>
				</label>
				<p class="text-micro-data text-warm-gray-500">{$_('ui.brush_outline_hint')}</p>
				{#if outlineTool.followPhotoEdges}<p class="text-micro-data text-warm-gray-500">{$_('ui.follow_photo_edges_hint')}</p>{/if}
			</div>
		{/if}

		<div class="hidden flex-col gap-2 border-t border-black/10 pt-2 md:flex">
			<div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.set_vertex')}</span><kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">{$_('ui.click')}</kbd></div>
			<div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.close_shape')}</span><kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">C</kbd></div>
			<div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.undo_vertex')}</span><kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Backspace</kbd></div>
			<div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.finalize')}</span><kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Enter / N</kbd></div>
		</div>
	</ToolOptions>
{/if}

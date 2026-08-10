<script>
	import { _ } from 'svelte-i18n';
	import {
		OUTLINE_FILL_COLORS,
		OUTLINE_MODES,
		OUTLINE_PRESETS,
		OUTLINE_STYLES
	} from '$lib/components/editor/tools/OutlineTool.svelte.js';
	import ToolOptions from './ToolOptions.svelte';
	let {
		outlineTool = null,
		activeTool = null,
		selectedOutlineStyle = $bindable('rock'),
		onClose = () => {}
	} = $props();

	let isOutlineTool = $derived(outlineTool?.id === 'outline');
</script>

{#if isOutlineTool}
	<ToolOptions title={$_('ui.outline_tool_options')} open={true} {onClose}>

		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium text-warm-gray-600">{$_('ui.drawing_mode')}</p>
			<div class="grid grid-cols-4 gap-1">
				{#each OUTLINE_MODES as mode}
					<button
						class="flex flex-col items-center gap-1 p-2 rounded-sm transition-none {outlineTool?.mode === mode.id
							? 'bg-creator-blue text-white'
							: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}"
						onclick={() => outlineTool?.setMode(mode.id)}
						title={$_(mode.labelKey)}
					>
						<i class="fas {mode.icon} text-sm"></i>
						<span class="text-[9px] font-medium leading-tight text-center max-w-full break-words"
							>{$_(mode.labelKey)}</span
						>
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
							class="flex min-h-13 flex-col items-center justify-center gap-1 rounded-sm p-1.5 transition-none {outlineTool?.mode === 'preset' && outlineTool?.preset === preset.id
								? 'bg-creator-blue text-white'
								: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}"
							onclick={() => outlineTool?.setPreset(preset.id)}
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
			<select id="outline-line-style" bind:value={selectedOutlineStyle} class="h-8 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none">
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
						class="w-6 h-6 rounded-sm transition-none {outlineTool?.fillColor === color.value
							? 'shadow-[inset_0_0_0_2px_var(--color-creator-blue)]'
							: ''}"
						style="background-color: {color.value || 'transparent'}; border: 1px solid #e5e7eb;"
						onclick={() => {
							if (color.value) {
								outlineTool?.setFill(color.value);
							} else {
								outlineTool?.clearFill();
							}
						}}
						title={$_(color.labelKey)}
					></button>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-2">
			<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
				<input
					type="checkbox"
					checked={outlineTool?.curveEnabled || false}
					onchange={(event) => outlineTool?.setCurveEnabled(event.currentTarget.checked)}
					class="h-4 w-4 rounded border-black/20 text-creator-blue focus:ring-creator-blue"
				/>
				<span>{$_('ui.curved_outline')}</span>
			</label>
			{#if outlineTool?.curveEnabled}
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<span class="w-20">{$_('ui.curve_amount')}</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={outlineTool.curveTension}
						class="min-w-0 flex-1"
					/>
					<span class="w-8 text-right">{outlineTool.curveTension}</span>
				</label>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<p class="text-xs font-medium text-warm-gray-600">{$_('ui.snap_to_grid')}</p>
				<button
					class="w-8 h-6 flex items-center justify-center rounded-sm transition-none {outlineTool?.snapToGrid
						? 'bg-creator-blue text-white'
						: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}"
					onclick={() => outlineTool && (outlineTool.snapToGrid = !outlineTool.snapToGrid)}
					title={$_('ui.snap_to_grid')}
				>
					<i class="fa-solid fa-th text-xs"></i>
				</button>
			</div>
			{#if outlineTool?.snapToGrid}
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<span class="w-20">{$_('ui.grid_size')}</span>
					<input
						type="number"
						min="0.001"
						max="0.1"
						step="0.001"
						bind:value={outlineTool.gridSize}
						class="h-7 w-20 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none"
					/>
				</label>
			{/if}
			{#if outlineTool?.mode === 'freehand'}
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<span class="w-20">{$_('ui.smoothing')}</span>
					<input
						type="range"
						min="0"
						max="8"
						step="0.5"
						bind:value={outlineTool.freehandSmoothingPx}
						class="min-w-0 flex-1"
					/>
					<span class="w-8 text-right">{outlineTool.freehandSmoothingPx}px</span>
				</label>
			{/if}
			{#if outlineTool?.mode === 'brush'}
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<span class="w-20">{$_('ui.brush_size')}</span>
					<input
						type="range"
						min="8"
						max="120"
						step="2"
						bind:value={outlineTool.brushSizePx}
						class="min-w-0 flex-1"
					/>
					<span class="w-10 text-right">{outlineTool.brushSizePx}px</span>
				</label>
				<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
					<input
						type="checkbox"
						bind:checked={outlineTool.followPhotoEdges}
						class="h-4 w-4 rounded border-black/20 text-creator-blue focus:ring-creator-blue"
					/>
					<span>{$_('ui.follow_photo_edges')}</span>
				</label>
				<p class="text-micro-data text-warm-gray-500">{$_('ui.brush_outline_hint')}</p>
				{#if outlineTool.followPhotoEdges}
					<p class="text-micro-data text-warm-gray-500">{$_('ui.follow_photo_edges_hint')}</p>
				{/if}
			{/if}
		</div>

		<div class="hidden flex-col gap-2 border-t border-black/10 pt-2 md:flex">
			<div class="flex items-center gap-1.5 text-micro-data">
				<span>{$_('ui.set_vertex')}</span>
				<kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">{$_('ui.click')}</kbd>
			</div>
			<div class="flex items-center gap-1.5 text-micro-data">
				<span>{$_('ui.close_shape')}</span>
				<kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">C</kbd>
			</div>
			<div class="flex items-center gap-1.5 text-micro-data">
				<span>{$_('ui.undo_vertex')}</span>
				<kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Backspace</kbd>
			</div>
			<div class="flex items-center gap-1.5 text-micro-data">
				<span>{$_('ui.finalize')}</span>
				<kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Enter / N</kbd>
			</div>
		</div>
	</ToolOptions>
{/if}

<style>
	.kbd {
		background-color: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 0.125rem;
		padding: 0.125rem 0.375rem;
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: bold;
		color: #111827;
	}
</style>

<script>
	import { _ } from 'svelte-i18n';
	import {
		OUTLINE_FILL_COLORS,
		OUTLINE_MODES,
		OUTLINE_STYLES
	} from '$lib/components/editor/tools/OutlineTool.svelte.js';
	let {
		outlineTool = null,
		activeTool = null,
		selectedOutlineStyle = $bindable('rock'),
		onFinalize = null,
		onCancelAction = null,
		onClose = () => {}
	} = $props();

	let isOutlineTool = $derived(outlineTool?.id === 'outline');
	let draftPointCount = $derived(
		outlineTool?.getPreviewPoints?.().length || outlineTool?.currentPoints?.length || 0
	);
	let canUndo = $derived((outlineTool?.currentPoints?.length || 0) > 0);
	let canCloseShape = $derived(isOutlineTool && (outlineTool?.currentPoints?.length || 0) > 2);
	let toolLabelKey = $derived(activeTool ? `ui.${activeTool}` : 'ui.outline_tool_options');

	function runAction(event, action) {
		event?.stopPropagation?.();
		event?.preventDefault?.();
		action?.();
	}
</script>

{#if isOutlineTool}
	<div class="hidden md:flex flex-col gap-3 p-3 bg-white rounded border border-black/15 shadow-modal">
		<div class="flex justify-between items-center">
			<h3 class="text-sm font-bold text-near-black">{$_('ui.outline_tool_options')}</h3>
			<button
				class="w-6 h-6 flex items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5"
				onclick={onClose}
				title={$_('ui.close')}
			>
				<i class="fa-solid fa-times text-xs"></i>
			</button>
		</div>

		<div class="flex flex-col gap-2">
			<label class="text-xs font-medium text-warm-gray-600">{$_('ui.drawing_mode')}</label>
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

		<div class="flex flex-col gap-2">
			<label class="text-xs font-medium text-warm-gray-600">{$_('ui.line_style')}</label>
			<select bind:value={selectedOutlineStyle} class="h-8 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none">
				{#each OUTLINE_STYLES as style}
					<option value={style.id}>{$_(style.labelKey)}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-2">
			<label class="text-xs font-medium text-warm-gray-600">{$_('ui.fill_color')}</label>
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
			<div class="flex items-center gap-2">
				<label class="text-xs font-medium text-warm-gray-600">{$_('ui.snap_to_grid')}</label>
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
		</div>

		<div class="flex flex-col gap-2 mt-2 pt-2 border-t border-black/10">
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
	</div>
{/if}

<div
	class="md:hidden pointer-events-auto mx-auto flex w-full max-w-[28rem] flex-col gap-2 rounded border border-black/15 bg-white p-2 shadow-panel"
	style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
>
	<div class="flex items-center justify-between gap-2">
		<div class="min-w-0 px-1">
			<p class="text-ui-label !m-0 truncate text-near-black">{$_(toolLabelKey)}</p>
		</div>

		<button
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5"
			onclick={(event) => runAction(event, onClose)}
			title={$_('ui.close')}
			aria-label={$_('ui.close')}
		>
			<i class="fa-solid fa-times text-sm"></i>
		</button>
	</div>

	<div class="grid grid-cols-3 gap-1 {isOutlineTool ? 'grid-cols-4' : ''}">
		<button
			class="flex h-10 items-center justify-center rounded-sm bg-near-black text-white disabled:opacity-40"
			disabled={draftPointCount < 2}
			onclick={(event) => runAction(event, () => (onFinalize ? onFinalize() : outlineTool?.finalize()))}
			title={$_('ui.finalize')}
			aria-label={$_('ui.finalize')}
		>
			<i class="fa-solid fa-check text-xs"></i>
		</button>
		{#if isOutlineTool}
			<button
				class="flex h-10 items-center justify-center rounded-sm bg-black/5 text-near-black disabled:opacity-40"
				disabled={!canCloseShape}
				onclick={(event) => runAction(event, () => outlineTool?.closeShape())}
				title={$_('ui.close_shape')}
				aria-label={$_('ui.close_shape')}
			>
				<i class="fa-solid fa-link text-xs"></i>
			</button>
		{/if}
		<button
			class="flex h-10 items-center justify-center rounded-sm bg-black/5 text-near-black disabled:opacity-40"
			disabled={!canUndo}
			onclick={(event) => runAction(event, () => outlineTool?.undoLastPoint())}
			title={$_('ui.undo_vertex')}
			aria-label={$_('ui.undo_vertex')}
		>
			<i class="fa-solid fa-rotate-left text-xs"></i>
		</button>
		<button
			class="flex h-10 items-center justify-center rounded-sm border border-black/15 bg-warm-white text-near-black"
			onclick={(event) =>
				runAction(event, () => (onCancelAction ? onCancelAction() : outlineTool?.cancel()))}
			title={$_('ui.cancel')}
			aria-label={$_('ui.cancel')}
		>
			<i class="fa-solid fa-xmark text-xs"></i>
		</button>
	</div>

	{#if isOutlineTool}
		<div class="grid grid-cols-4 gap-1">
			{#each OUTLINE_MODES as mode}
				<button
					class="flex h-10 items-center justify-center rounded-sm transition-none {outlineTool?.mode ===
					mode.id
						? 'bg-creator-blue text-white'
						: 'bg-black/5 text-warm-gray-500'}"
					onclick={(event) => runAction(event, () => outlineTool?.setMode(mode.id))}
					title={$_(mode.labelKey)}
					aria-label={$_(mode.labelKey)}
				>
					<i class="fas {mode.icon} text-sm"></i>
				</button>
			{/each}
		</div>

		<div class="grid grid-cols-[1fr_auto] gap-2">
			<select
				bind:value={selectedOutlineStyle}
				class="h-9 min-w-0 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none"
				aria-label={$_('ui.line_style')}
			>
				{#each OUTLINE_STYLES as style}
					<option value={style.id}>{$_(style.labelKey)}</option>
				{/each}
			</select>

			<button
				class="flex h-9 w-10 items-center justify-center rounded-sm transition-none {outlineTool?.snapToGrid
					? 'bg-creator-blue text-white'
					: 'bg-black/5 text-warm-gray-500'}"
				onclick={(event) =>
					runAction(event, () => {
						if (outlineTool) outlineTool.snapToGrid = !outlineTool.snapToGrid;
					})}
				title={$_('ui.snap_to_grid')}
				aria-label={$_('ui.snap_to_grid')}
			>
				<i class="fa-solid fa-th text-xs"></i>
			</button>
		</div>

		<div class="flex items-center gap-1 overflow-x-auto pb-0.5">
			{#each OUTLINE_FILL_COLORS as color}
				<button
					class="h-8 w-8 shrink-0 rounded-sm transition-none {outlineTool?.fillColor === color.value
						? 'shadow-[inset_0_0_0_2px_var(--color-creator-blue)]'
						: ''}"
					style="background-color: {color.value || 'transparent'}; border: 1px solid #e5e7eb;"
					onclick={(event) =>
						runAction(event, () => {
							if (color.value) {
								outlineTool?.setFill(color.value);
							} else {
								outlineTool?.clearFill();
							}
						})}
					title={$_(color.labelKey)}
					aria-label={$_(color.labelKey)}
				></button>
			{/each}
		</div>

		{#if outlineTool?.mode === 'freehand'}
			<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600">
				<i class="fa-solid fa-wave-square text-[10px]"></i>
				<input
					type="range"
					min="0"
					max="8"
					step="0.5"
					bind:value={outlineTool.freehandSmoothingPx}
					class="min-w-0 flex-1"
					aria-label={$_('ui.smoothing')}
				/>
				<span class="w-8 text-right text-micro-data">{outlineTool.freehandSmoothingPx}px</span>
			</label>
		{/if}
	{/if}
</div>

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

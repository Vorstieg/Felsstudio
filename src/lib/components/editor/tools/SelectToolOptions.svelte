<script>
	import ToolOptions from './ToolOptions.svelte';
	import PathDrawingOptions from './PathDrawingOptions.svelte';
	import { createPathDrawingOptionsLogic } from './path-drawing-logic.js';
	import { OUTLINE_FILL_COLORS, OUTLINE_STYLES } from './OutlineTool.svelte.js';
	import { _ } from 'svelte-i18n';

	let {
		selectedOutlineId = null,
		selectedRoute = null,
		outlineEditTool = null,
		outlineGridActions,
		selectedOutline = null,
		outlineCurveActions,
		outlineStyleActions,
		simplifyTolerancePx = $bindable(2),
		simplifySummary = '',
		onSimplify = () => {},
		onClose = () => {}
	} = $props();

	const routePathActions = createPathDrawingOptionsLogic({
		getGridTool: () => selectedRoute?.routeEditTool,
		getCurveTarget: () => selectedRoute,
		updateCurve: (route, changes) => route.onCurveChange?.(changes)
	});

	function fillSwatchStyle(color) {
		if (color.value == null) {
			return 'background-color: #fff; background-image: linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%); background-size: 8px 8px; background-position: 0 0, 0 4px, 4px -4px, -4px 0; border: 1px solid #9ca3af;';
		}
		return `background-color: ${color.value}; border: 1px solid #9ca3af;`;
	}
</script>

{#if selectedOutlineId != null}
	<ToolOptions title="Outline tools" open={true} {onClose}>
		<div class="flex flex-col gap-2">
			<label for="selected-outline-type" class="text-xs font-medium text-warm-gray-600"
				>{$_('ui.outline_type')}</label
			>
			<select
				id="selected-outline-type"
				value={selectedOutline?.lineStyle || 'rock'}
				onchange={(event) => outlineStyleActions?.setLineStyle(event.currentTarget.value)}
				class="h-8 rounded-sm border border-black/15 bg-white px-2 text-xs text-near-black outline-none"
			>
				{#each OUTLINE_STYLES as style}
					<option value={style.id}>{$_(style.labelKey)}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium text-warm-gray-600">{$_('ui.fill_color')}</p>
			<div class="grid grid-cols-5 gap-1">
				{#each OUTLINE_FILL_COLORS as color}
					<button
						type="button"
						class="relative h-6 w-6 overflow-hidden rounded-sm transition-none {selectedOutline?.fillColor === color.value
							? 'shadow-[inset_0_0_0_2px_var(--color-creator-blue)]'
							: ''}"
						style={fillSwatchStyle(color)}
						onclick={() => outlineStyleActions?.setFillColor(color.value, color.opacity)}
						title={$_(color.labelKey)}
						aria-label={$_(color.labelKey)}
					>
						{#if color.value == null}<span class="absolute left-1/2 top-0 h-full w-0.5 -rotate-45 bg-red-500"></span>{/if}
					</button>
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<PathDrawingOptions
				snapToGrid={outlineEditTool?.snapToGrid}
				gridSize={outlineEditTool?.gridSize}
				gridSizeMax={0.25}
				gridSizeStep={0.005}
				curveEnabled={selectedOutline?.curve?.enabled || false}
				curveTension={selectedOutline?.curve?.tension ?? 0.5}
				onToggleSnapToGrid={outlineGridActions?.toggleSnapToGrid}
				onGridSizeChange={outlineGridActions?.setGridSize}
				onCurveEnabledChange={outlineCurveActions?.setCurveEnabled}
				onCurveTensionChange={outlineCurveActions?.setCurveTension}
			/>
			<label class="text-xs font-medium text-warm-gray-600" for="outline-simplify-tolerance">
				Simplify selected outline
			</label>
			<div class="grid grid-cols-[1fr_auto] gap-1 items-center">
				<input
					id="outline-simplify-tolerance"
					bind:value={simplifyTolerancePx}
					type="number"
					min="0.5"
					step="0.5"
					class="input-studio w-full"
					aria-label="Simplification tolerance in pixels"
				/>
				<button
					type="button"
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={onSimplify}>Simplify</button
				>
			</div>
			<p class="text-[10px] text-warm-gray-400">
				Removes redundant vertices using a pixel tolerance. Undo restores the original.
			</p>
			{#if simplifySummary}
				<p class="text-[10px] text-warm-gray-500">{simplifySummary}</p>
			{/if}
		</div>
	</ToolOptions>
{:else if selectedRoute}
	<ToolOptions title="Route tools" open={true} {onClose}>
		<PathDrawingOptions
			snapToGrid={selectedRoute.routeEditTool?.snapToGrid}
			gridSize={selectedRoute.routeEditTool?.gridSize}
			onToggleSnapToGrid={routePathActions.toggleSnapToGrid}
			onGridSizeChange={routePathActions.setGridSize}
			curveEnabled={selectedRoute.curve?.enabled || false}
			curveTension={selectedRoute.curve?.tension ?? 0.45}
			onCurveEnabledChange={routePathActions.setCurveEnabled}
			onCurveTensionChange={routePathActions.setCurveTension}
		/>
	</ToolOptions>
{/if}

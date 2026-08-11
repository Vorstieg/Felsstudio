<script>
	import ToolOptions from './ToolOptions.svelte';
	import PathDrawingOptions from './PathDrawingOptions.svelte';
	import { createPathDrawingOptionsLogic } from './path-drawing-logic.js';

	let {
		selectedOutlineId = null,
		selectedRoute = null,
		outlineEditTool = null,
		outlineGridActions,
		selectedOutline = null,
		outlineCurveActions,
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
</script>

{#if selectedOutlineId != null}
	<ToolOptions title="Outline tools" open={true} {onClose}>
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

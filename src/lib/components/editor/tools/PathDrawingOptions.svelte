<script lang="ts">
	import { _ } from 'svelte-i18n';
	type Props = {
		showGrid?: boolean;
		snapToGrid?: boolean;
		gridSize?: number;
		gridSizeMax?: number;
		gridSizeStep?: number;
		curveEnabled?: boolean;
		curveTension?: number;
		onToggleSnapToGrid?: () => void;
		onGridSizeChange?: (_value: string) => void;
		onCurveEnabledChange?: (_enabled: boolean) => void;
		onCurveTensionChange?: (_value: string) => void;
	};

	let {
		showGrid = true,
		snapToGrid = false,
		gridSize = 0.01,
		gridSizeMax = 0.1,
		gridSizeStep = 0.001,
		curveEnabled = false,
		curveTension = 0.5,
		onToggleSnapToGrid = () => {
		},
		onGridSizeChange = () => {
		},
		onCurveEnabledChange = () => {
		},
		onCurveTensionChange = () => {
		}
		}: Props = $props();
</script>
<div class="flex flex-col gap-2">
	{#if showGrid}<div class="flex items-center gap-2"><p class="text-xs font-medium text-warm-gray-600">{$_('ui.snap_to_grid')}</p>
		<button type="button"
		        class="w-8 h-6 flex items-center justify-center rounded-sm {snapToGrid ? 'bg-creator-blue text-white' : 'bg-black/5 text-warm-gray-500'}"
		        title={$_('ui.snap_to_grid')}
		        onclick={onToggleSnapToGrid}><i class="fa-solid fa-th text-xs"></i></button>
	</div>
	{#if snapToGrid}<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600"><span
		class="w-20">{$_('ui.grid_size')}</span><input type="number" min="0.001" max={gridSizeMax} step={gridSizeStep}
	                                                 value={gridSize}
	                                                 onchange={(event) => onGridSizeChange(event.currentTarget.value)}
	                                                 class="h-7 w-20 rounded-sm border border-black/15 bg-white px-2 text-xs" /></label>{/if}{/if}
	<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600"><input type="checkbox"
	                                                                                     checked={curveEnabled}
	                                                                                     onchange={(event) => onCurveEnabledChange(event.currentTarget.checked)} /><span>{$_('ui.curved_outline')}</span></label>
	{#if curveEnabled}<label class="flex items-center gap-2 text-xs font-medium text-warm-gray-600"><span
		class="w-20">{$_('ui.curve_amount')}</span><input type="range" min="0" max="1" step="0.05" value={curveTension}
	                                                    oninput={(event) => onCurveTensionChange(event.currentTarget.value)}
	                                                    class="min-w-0 flex-1" /><span
		class="w-8 text-right">{curveTension}</span></label>{/if}
</div>

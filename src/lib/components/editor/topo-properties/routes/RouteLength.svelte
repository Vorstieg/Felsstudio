<script lang="ts">
	import { calculateRouteLength } from '$lib/assets/js/topo-utils.ts';
	import type { Route } from '@vorstieg/fels-types/types';
	import { _ } from 'svelte-i18n';

	type Props = {
		route: Pick<Route, 'points3D' | 'length'>;
		topoScale: number;
		onFieldChange: (_field: string, _value: unknown) => void;
	};
	let { route, topoScale, onFieldChange }: Props = $props();
	let has3DPoints = $derived((route.points3D?.length ?? 0) > 1);
	let displayValue = $derived(
		route.length != null && Number(route.length) > 0 ? String(route.length) : ''
	);
</script>

<div>
	<label class="text-ui-label block" for="route-length">{$_('ui.length')}</label>
	<div class="flex items-center gap-1">
		<div class="relative min-w-0 flex-1">
			<input
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				value={displayValue}
				placeholder={$_('editor.length_placeholder')}
				onchange={(event) => {
					const raw = event.currentTarget.value.trim();
					onFieldChange('length', raw === '' ? undefined : raw);
				}}
				class={`input-studio w-full pr-8! ${has3DPoints ? 'pl-8' : ''}`}
				id="route-length"
			/>

			{#if has3DPoints}
				<button
					type="button"
					onclick={() => {
						const calculated = calculateRouteLength(route, topoScale);
						if (calculated > 0) onFieldChange('length', calculated);
					}}
					title={$_('ui.length')}
					aria-label={$_('ui.length')}
					class="fa-solid fa-calculator absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 z-10"
				></button>
			{/if}

			<span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-micro-data">m</span>
		</div>
	</div>
</div>

<script>
	import { calculateRouteLength } from '$lib/assets/js/topo-utils.js';
	import { _ } from 'svelte-i18n';

	let { route, topoScale, onFieldChange } = $props();
</script>
<div>

	<label class="text-ui-label block" for="route-length">{$_('ui.length')}</label>
	<div class="flex items-center gap-1">
		<div class="relative min-w-0 flex-1">
			<input
				type="text" inputmode="numeric" pattern="[0-9]*"
				value={route.length ?? 0}
				onchange={(event) => {onFieldChange('length', event.currentTarget.value); }}
				class="input-studio w-full pl-8 pr-8!"
				id="route-length"
			/>

			<button
				onclick={() => {
				onFieldChange('length', calculateRouteLength(route, topoScale));
			}}
				title={$_('ui.length')}
				aria-label={$_('ui.length')}
				class="fa-solid fa-calculator absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 z-10"
			>
			</button>

			<span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-micro-data">m</span>
		</div>

	</div>
</div>

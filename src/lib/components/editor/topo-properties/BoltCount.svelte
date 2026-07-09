<script>
	import { calculateBoltAmount, calculateRouteLength } from '$lib/assets/js/topo-utils.js';
	import { userState } from '$lib/state/editor.svelte.js';
	import { _ } from 'svelte-i18n';

	let { route, boltCount = $bindable(), fixPoints } = $props();
</script>

<label class="text-ui-label block" for="route-length">{$_('topo.protection')}</label>
<div class="flex items-center gap-1">
	<div class="relative min-w-0 flex-1">
		<input
			type="number"
			bind:value={boltCount}
			class="input-studio w-full pl-8 pr-8!"
			id="route-length"
		/>

		<button
			onclick={() => (boltCount = calculateBoltAmount(route,fixPoints))}
			title={$_('ui.length')}
			aria-label={$_('ui.length')}
			class="fa-solid fa-calculator absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 z-10"
		>
		</button>
	</div>

</div>
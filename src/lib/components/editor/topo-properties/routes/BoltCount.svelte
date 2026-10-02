<script lang="ts">
	import { calculateBoltAmount } from '$lib/assets/js/topo-utils.ts';
	import type { FixPoint, Route } from '@vorstieg/fels-types/types';
	import { _ } from 'svelte-i18n';

	type BoltRoute = Pick<Route, 'fixPoints' | 'boltAmount'>;
	type Props = {
		route: BoltRoute;
		fixPoints: FixPoint[];
		onFieldChange: (_field: string, _value: unknown) => void;
	};
	let { route, fixPoints, onFieldChange }: Props = $props();
</script>
<div>
	<label class="text-ui-label block" for="route-length">{$_('topo.protection')}</label>
	<div class="flex items-center gap-1">
		<div class="relative min-w-0 flex-1">
			<input
				type="text" inputmode="numeric" pattern="[0-9]*"
					value={route.boltAmount ?? ''}
				oninput={(event) => { onFieldChange('boltAmount', event.currentTarget.value); }}
				class="input-studio w-full pl-8 pr-8!"
				id="route-length"
			/>

			<button
				onclick={() => {
				onFieldChange('boltAmount', calculateBoltAmount(route, fixPoints));
			}}
				title={$_('ui.length')}
				aria-label={$_('ui.length')}
				class="fa-solid fa-calculator absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 z-10"
			>
			</button>
		</div>

	</div>
</div>

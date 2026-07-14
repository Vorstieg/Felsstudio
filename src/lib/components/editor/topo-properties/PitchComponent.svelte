<script>
	import GradeSelector from '$lib/components/editor/topo-properties/GradeSelector.svelte';
	import RouteLength from '$lib/components/editor/topo-properties/RouteLength.svelte';
	import BoltCount from '$lib/components/editor/topo-properties/BoltCount.svelte';
	import { routeLineStyles } from '$lib/components/editor/topo-properties/topo-properties-utils.js';
	import { userState } from '$lib/state/editor.svelte.js';
	import { _ } from 'svelte-i18n';

	let {
		pitch = $bindable(),
		kind = 'single',
		index = 0,
		mobile = false,
		showBoltCount = true,
		inheritLineStyle = false,
		defaultLineStyle = 'red',
		onDraw = null,
		onRemove = null,
		onChange = null
	} = $props();
</script>

<div class="gap-1 rounded-sm border border-black/10 bg-white p-1" onchange={() => onChange?.(pitch)}>
	{#if kind !== 'single' || onDraw || onRemove}
		<div class="flex items-center justify-between w-full">
			{#if kind === 'variant'}
				<input
					bind:value={pitch.name}
					placeholder={$_('ui.variant_name_placeholder')}
					class="min-w-0 flex-1 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
				/>
			{:else}
				<span>{`${$_('ui.pitch')} ${index + 1}`}</span>
			{/if}

			{#if onDraw || onRemove}
				<div class="flex gap-2">
					{#if onDraw}
						<button
							class="text-creator-blue"
							onclick={() => onDraw(pitch)}
							title={$_(`ui.draw_${kind}`)}
							aria-label={$_(`ui.draw_${kind}`)}
						>
							<i class="fa-solid fa-pencil text-[9px]"></i>
						</button>
					{/if}
					{#if onRemove}
						<button
							class="text-rose-500"
							onclick={() => onRemove(pitch, index)}
							title={$_(`ui.delete_${kind}`)}
							aria-label={$_(`ui.delete_${kind}`)}
						>
							<i class="fa-solid fa-trash-can text-[9px]"></i>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<GradeSelector route={pitch} bind:grade={pitch.grade} bind:scale={pitch._gradeScale} />
	<div class={showBoltCount ? 'grid grid-cols-2 gap-2' : ''}>
		<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
			<RouteLength
				bind:length={pitch.length}
				route={pitch}
				topoScale={userState.topo.scale}
				onCalculate={() => onChange?.(pitch)}
			/>
		</div>
		{#if showBoltCount}
			<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
				<BoltCount
					bind:boltCount={pitch.boltAmount}
					route={pitch}
					fixPoints={userState.topo.fixPoints}
					onCalculate={() => onChange?.(pitch)}
				/>
			</div>
		{/if}
	</div>
	<select
		value={pitch.lineStyle || (inheritLineStyle ? '' : defaultLineStyle)}
		onchange={(event) => (pitch.lineStyle = event.currentTarget.value)}
		class="w-full rounded-sm border border-black/15 bg-white px-1 py-1 text-micro-data outline-none"
	>
		{#if inheritLineStyle}
			<option value="">Use route line style</option>
		{/if}
		{#each routeLineStyles as style}
			<option value={style.id}>{style.label}</option>
		{/each}
	</select>
</div>

<script>
	import GradeSelector from '$lib/components/editor/topo-properties/routes/GradeSelector.svelte';
	import RouteLength from '$lib/components/editor/topo-properties/routes/RouteLength.svelte';
	import BoltCount from '$lib/components/editor/topo-properties/routes/BoltCount.svelte';
	import { routeLineStyles } from '$lib/components/editor/topo-properties/topo-properties-utils.js';

	import { _ } from 'svelte-i18n';

	let {
		pitch = $bindable(),
		kind = 'single',
		index = 0,
		topoScale = null,
		fixPoints = null,
		onDraw = null,
		onRemove = null,
		onDuplicate = null,
		duplicateTargets = [],
		onMove = null,
		canMoveUp = false,
		canMoveDown = false,
		onFieldChange
	} = $props();

	function defaultLineStyle() {
		switch (kind) {
			case 'single':
				return 'red';
			case 'pitch':
				return '';
		}
		return 'variant';
	}

	function hasInheritStyle() {
		return kind !== 'single';
	}

</script>

<div class="gap-1">
	{#if kind !== 'single'}
		<div class="flex items-center justify-between w-full">
			{#if kind === 'variant'}
				<input
					value={pitch.name || ''}
					oninput={(event) => onFieldChange('name', event.currentTarget.value)}
					placeholder={$_('ui.variant_name_placeholder')}
					class="min-w-0 flex-1 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
				/>
			{:else}
				<span>{`${$_('ui.pitch')} ${index + 1}`}</span>
			{/if}

			{#if onDraw || onDuplicate || onMove || onRemove}
				<div class="flex items-center gap-2">
					{#if onMove}
						<div class="flex gap-1">
							<button
								class="text-warm-gray-500 disabled:text-warm-gray-250"
								disabled={!canMoveUp}
								onclick={() => onMove(pitch, -1)}
								title="Move pitch up"
								aria-label="Move pitch up"
							>
								<i class="fa-solid fa-arrow-up text-[9px]"></i>
							</button>
							<button
								class="text-warm-gray-500 disabled:text-warm-gray-250"
								disabled={!canMoveDown}
								onclick={() => onMove(pitch, 1)}
								title="Move pitch down"
								aria-label="Move pitch down"
							>
								<i class="fa-solid fa-arrow-down text-[9px]"></i>
							</button>
						</div>
					{/if}
					{#if onDuplicate && duplicateTargets.length}
						<select
							class="max-w-28 rounded-sm border border-black/15 bg-white px-1 py-0.5 text-micro-data outline-none"
							value=""
							title="Duplicate pitch to route"
							onchange={(event) => {
								const targetRouteId = event.currentTarget.value;
								if (targetRouteId) onDuplicate(pitch, targetRouteId);
								event.currentTarget.value = '';
							}}
						>
							<option value="">Copy to…</option>
							{#each duplicateTargets as target}
								<option value={target.id}>{target.name || target.id}</option>
							{/each}
						</select>
					{/if}
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

	<GradeSelector
		route={pitch}
		grade={pitch.grade}
		onFieldChange={onFieldChange}
	/>
	<div class='grid grid-cols-2 gap-2 mt-1'>
		<RouteLength
			route={pitch}
			topoScale={topoScale ?? 1}
			onFieldChange={onFieldChange}
		/>
		<BoltCount
			boltCount={pitch.boltAmount}
			route={pitch}
			fixPoints={fixPoints ?? []}
			onFieldChange={onFieldChange}
		/>
	</div>
	<select
		value={pitch.lineStyle || defaultLineStyle()}
		onchange={(event) => onFieldChange('lineStyle', event.currentTarget.value)}
		class="w-full rounded-sm border border-black/15 bg-white px-1 py-1 text-micro-data outline-none"
	>
		{#if hasInheritStyle()}
			<option value="">Use route line style</option>
		{/if}
		{#each routeLineStyles as style}
			<option value={style.id}>{style.label}</option>
		{/each}
	</select>
</div>

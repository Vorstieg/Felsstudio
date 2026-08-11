<script>
	import GradeSelector from '$lib/components/editor/topo-properties/routes/GradeSelector.svelte';
	import RouteLength from '$lib/components/editor/topo-properties/routes/RouteLength.svelte';
	import BoltCount from '$lib/components/editor/topo-properties/routes/BoltCount.svelte';
	import { routeLineStyles } from '$lib/components/editor/topo-properties/topo-properties-utils.js';
	import { getContext } from 'svelte';
	import { TOPO_EDITOR_SESSION } from '$lib/state/topo-session.svelte.js';
	const userState = getContext(TOPO_EDITOR_SESSION);
	import { _ } from 'svelte-i18n';

	let {
		pitch = $bindable(),
		kind = 'single',
		index = 0,
		mobile = false,
		showBoltCount = true,
		inheritLineStyle = false,
		defaultLineStyle = 'red',
		topoScale = null,
		fixPoints = null,
		onDraw = null,
		onRemove = null,
		onChange = null,
		onFieldChange = null
	} = $props();

	function updateField(field, value) {
		if (onFieldChange) onFieldChange(field, value);
		else pitch[field] = value;
	}
</script>

<div
	class="gap-1 rounded-sm"
	onchange={() => onChange?.(pitch)}
>
	{#if kind !== 'single' || onDraw || onRemove}
		<div class="flex items-center justify-between w-full">
			{#if kind === 'variant'}
				<input
					value={pitch.name || ''}
					oninput={(event) => updateField('name', event.currentTarget.value)}
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

	<GradeSelector
		route={pitch}
		grade={pitch.grade}
		scale={pitch._gradeScale}
		onFieldChange={updateField}
	/>
	<div class={showBoltCount ? 'grid grid-cols-2 gap-2' : ''}>
		<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
			<RouteLength
				length={pitch.length}
				route={pitch}
				topoScale={topoScale ?? userState?.topo?.scale ?? 1}
				onFieldChange={updateField}
				onCalculate={() => onChange?.(pitch)}
			/>
		</div>
		{#if showBoltCount}
			<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
				<BoltCount
					boltCount={pitch.boltAmount}
					route={pitch}
					fixPoints={fixPoints ?? userState?.topo?.fixPoints ?? []}
					onFieldChange={updateField}
					onCalculate={() => onChange?.(pitch)}
				/>
			</div>
		{/if}
	</div>
	<select
		value={pitch.lineStyle || (inheritLineStyle ? '' : defaultLineStyle)}
		onchange={(event) => updateField('lineStyle', event.currentTarget.value)}
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

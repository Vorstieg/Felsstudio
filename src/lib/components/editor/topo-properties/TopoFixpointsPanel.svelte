<script>
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	const editorState = getTopo2DEditorState();
	let topo = $derived(editorState.topo);
	const ui = editorState.ui;
	import { _ } from 'svelte-i18n';
	import { topoSymbols } from '@vorstieg/topo-renderer';
	import { createAiFixpoint } from './topo-properties-utils.js';

	let { aiSuggestions = [], mobile = false } = $props();

	function toggleCluster(cluster) {
		if (editorState.clustering.lockedClusterId === cluster.id) {
			editorState.clustering.lockedClusterId = null;
		} else {
			editorState.clustering.lockedClusterId = cluster.id;
		}
		editorState.clustering.selectedClusterId = cluster.id;
	}

	function addAiBolt(cluster) {
		editorState.addFixpoint(createAiFixpoint(cluster));
		editorState.clustering.selectedClusterId = null;
	}

	function removeFixpoint(point, index) {
		const pointId = point?.id;
		editorState.removeFixpoint(pointId);
	}

	function updateFixpointType(point, type) {
		editorState.updateFixpoint(point.id, { type });
	}
</script>

{#if aiSuggestions.length > 0}
	<div
		class={mobile
			? 'mb-4 space-y-1.5'
			: 'bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5 mb-4'}
		style={mobile
			? undefined
			: `margin-bottom: ${editorState.clustering.lockedClusterId ? '70px' : '1rem'}`}
	>
		{#if mobile}
			<p class="text-ui-label text-creator-blue px-1 mb-0.5">{$_('ui.nearby_suggestions')}</p>
		{:else}
			<div class="flex justify-between items-center">
				<span class="text-ui-label text-creator-blue">{$_('ui.ai_suggestions_title')}</span>
			</div>
		{/if}

		<div class={mobile ? 'space-y-1.5' : 'space-y-1'}>
			{#each aiSuggestions as cluster (cluster.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					id={'ai-bolt-' + cluster.id}
					class={mobile
						? `panel p-3 flex items-center gap-3 border-2 cursor-pointer transition-none ${
								editorState.clustering.lockedClusterId === cluster.id
									? 'border-creator-blue bg-creator-blue/10'
									: editorState.clustering.selectedClusterId === cluster.id
										? 'border-creator-blue/60 bg-creator-blue/10'
										: 'border-creator-blue/30 bg-creator-blue/5 hover:border-creator-blue/60 hover:bg-creator-blue/10'
							}`
						: `bg-white rounded-sm p-1.5 shadow-sm border flex items-center justify-between gap-2 group transition-none cursor-pointer ${
								editorState.clustering.lockedClusterId === cluster.id
									? 'border-creator-blue ring-1 ring-creator-blue'
									: editorState.clustering.selectedClusterId === cluster.id
										? 'border-creator-blue/60'
										: 'border-black/15 hover:border-creator-blue'
							}`}
					onclick={() => toggleCluster(cluster)}
				>
					<div
						class={mobile
							? 'w-8 h-8 rounded-sm bg-creator-blue/10 flex items-center justify-center text-creator-blue text-xs font-black shadow-sm'
							: 'flex items-center gap-2'}
					>
						{#if mobile}
							<i class="fa-solid fa-wand-magic-sparkles"></i>
						{:else}
							<div
								class="w-6 h-6 rounded-sm bg-creator-blue/10 flex items-center justify-center text-creator-blue text-micro-data font-bold"
							>
								<i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
							</div>
							<div class="min-w-0">
								<p class="text-body-text font-bold text-near-black leading-tight truncate">
									{cluster.class === 'anchor' || cluster.class === 'belay'
										? $_('ui.ai_anchor')
										: $_('ui.ai_bolt')}
									<span class="text-[10px] text-warm-gray-500 font-normal ml-0.5"
										>({Math.round(cluster.conf)}
										%)</span
									>
								</p>
							</div>
						{/if}
					</div>
					{#if mobile}
						<div class="flex-1">
							<div class="text-sm font-black text-near-black">
								{cluster.class === 'anchor' || cluster.class === 'belay'
									? $_('ui.ai_anchor')
									: $_('ui.ai_bolt')}
							</div>
							<div class="text-xs text-warm-gray-500">
								{Math.round(cluster.conf)}% {$_('ui.match')}
							</div>
						</div>
					{/if}
					<button
						class={mobile
							? 'w-9 h-9 flex items-center justify-center rounded-sm bg-near-black text-white font-bold text-xs'
							: 'px-2 py-1 bg-near-black text-white rounded-sm text-micro-data font-bold hover:bg-black'}
						onclick={(e) => {
							e.stopPropagation();
							addAiBolt(cluster);
						}}>Add</button
					>
				</div>
			{/each}
		</div>
	</div>
{/if}

{#if topo.fixPoints.length === 0}
	<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
		<p class="text-body-text text-warm-gray-500 font-medium">{$_('ui.no_fixpoints_yet')}</p>
	</div>
{:else if mobile}
	{#each topo.fixPoints as point, i (point.id)}
		<div
			id={'fixpoint-' + point.id}
			class="panel p-3 flex items-center gap-3 border-2 {ui.selectedFixpointId ===
			point.id
				? 'border-creator-blue'
				: 'border-transparent'}"
		>
			<button
				class="w-9 h-9 rounded-sm transition-none bg-warm-gray-100 flex items-center justify-center text-warm-gray-500 text-xs font-black shadow-sm"
				onclick={() => {
					if (ui.selectedFixpointId === point.id) editorState.clearSelection();
					else editorState.selectObject('symbol', point.id);
				}}
				aria-label={`${$_('ui.fixpoints')} ${i + 1}`}
			>
				{i + 1}
			</button>
				<select
					value={point.type}
					onchange={(event) => updateFixpointType(point, event.currentTarget.value)}
				class="min-w-0 flex-1 bg-transparent text-sm font-black text-near-black outline-none appearance-none"
			>
				{#each topoSymbols as symbol}
					<option value={symbol.id}>{$_(`topo.fixpoints.${symbol.id}`)}</option>
				{/each}
			</select>
			<button
				aria-label="Remove fixpoint"
				class="h-9 flex items-center justify-center gap-1.5 rounded-sm bg-rose-50 px-3 text-[11px] font-bold text-rose-700 transition-none hover:bg-rose-100"
				onclick={() => removeFixpoint(point, i)}
			>
				<i class="fa-solid fa-trash-can text-[10px]"></i>
				<span>{$_('ui.remove')}</span>
			</button>
		</div>
	{/each}
{:else}
	<div class="grid grid-cols-1 gap-1.5">
	{#each topo.fixPoints as point, i (point.id)}
			<div
				id={'fixpoint-' + point.id}
				class={'panel-inner p-2 transition-none flex items-center gap-2 border ' +
					(ui.selectedFixpointId === point.id
						? 'border-creator-blue'
						: 'border-transparent')}
			>
				<div
					class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data font-bold border border-black/10 shadow-sm"
				>
					{i + 1}
				</div>
				<div class="flex-1">
						<select
							value={point.type}
							onchange={(event) => updateFixpointType(point, event.currentTarget.value)}
						class="w-full bg-transparent text-body-text font-bold text-near-black outline-none appearance-none"
					>
						{#each topoSymbols as symbol}
							<option value={symbol.id}>{$_(`topo.fixpoints.${symbol.id}`)}</option>
						{/each}
					</select>
				</div>
				<button
					aria-label="Remove fixpoint"
					class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
					onclick={() => removeFixpoint(point, i)}
					><i class="fa-solid fa-trash-can text-[10px]"></i></button
				>
			</div>
		{/each}
	</div>
{/if}

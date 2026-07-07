<script>
	import { _ } from 'svelte-i18n';

	let {
		workspace,
		onComplete,
		filteredLocations = [],
		isLoading = false,
		searchQuery = $bindable(''),
		expandedCragPath = $bindable(null),
		loadFromEntry,
		isTopoWorkspace
	} = $props();
</script>

<div class="space-y-3">
	{#if workspace === 'crags/editor'}
		<button class="btn-primary w-full" onclick={() => onComplete('crags/editor')}>
			<i class="fa-solid fa-plus mr-2"></i>{$_('ui.new_crag')}
		</button>
	{/if}

	<div class="relative">
		<i
			class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray-300 text-[11px]"
		></i>
		<input
			type="text"
			placeholder={$_('ui.search_crags')}
			bind:value={searchQuery}
			class="input-studio w-full !pl-8"
		/>
	</div>

	<div class="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar relative">
		{#if isLoading}
			<div
				class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded"
			>
				<div class="flex flex-col items-center gap-2">
					<i class="fa-solid fa-spinner fa-spin text-creator-blue text-xl"></i>
					<span class="text-micro-data font-bold text-near-black uppercase tracking-widest"
						>{$_('ui.initializing')}</span
					>
				</div>
			</div>
		{/if}

		{#each filteredLocations as crag}
			{@const sectors = crag.properties.sectors || []}
			{@const showSectorChoices = isTopoWorkspace() && sectors.length > 0}
			<div class="bg-white rounded border border-transparent hover:border-black/15 transition-none">
				<button
					class="w-full p-2.5 text-left hover:bg-black/5 rounded transition-none group flex items-center justify-between disabled:opacity-50"
					onclick={() =>
						showSectorChoices
							? (expandedCragPath =
									expandedCragPath === crag.properties.path ? null : crag.properties.path)
							: loadFromEntry(crag)}
					disabled={isLoading}
				>
					<div>
						<div class="text-body-text font-bold group-hover:text-creator-blue transition-none">
							{crag.properties.name}
						</div>
						<div class="text-micro-data text-warm-gray-400">{crag.properties.path}</div>
					</div>
					<i
						class="fa-solid {showSectorChoices && expandedCragPath === crag.properties.path
							? 'fa-chevron-down'
							: 'fa-chevron-right'} text-warm-gray-300 text-[10px] group-hover:text-creator-blue transition-none"
					></i>
				</button>

				{#if showSectorChoices && expandedCragPath === crag.properties.path}
					<div class="border-t border-black/10 p-1.5 space-y-1 bg-warm-white/70">
						<button
							class="w-full px-2 py-1.5 rounded-sm text-left text-body-text bg-white border border-black/10 hover:border-creator-blue hover:text-creator-blue transition-none disabled:opacity-50"
							onclick={() => loadFromEntry(crag)}
							disabled={isLoading}
						>
							<span class="font-bold">{crag.properties.name}</span>
							<span class="block text-micro-data text-warm-gray-400">Whole crag</span>
						</button>
						{#each sectors as sector}
							<button
								class="w-full px-2 py-1.5 rounded-sm text-left text-body-text bg-white border border-black/10 hover:border-creator-blue hover:text-creator-blue transition-none disabled:opacity-50"
								onclick={() => loadFromEntry(crag, sector)}
								disabled={isLoading}
							>
								<span class="font-bold">{sector.name || sector.id}</span>
								<span class="block text-micro-data text-warm-gray-400"
									>{sector.assets?.topos?.[0] || 'No topo asset'}</span
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="text-center py-6 text-body-text text-warm-gray-500">
				{$_('ui.no_entries_found')}
			</div>
		{/each}
	</div>
</div>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { fetchCragsFromManifest } from '$lib/assets/js/fetchCrags.ts';

	type Location = Awaited<ReturnType<typeof fetchCragsFromManifest>>[number];
	type WorkspacePath = {
		isCragEditor: () => boolean;
	};
	type Props = {
		workSpaceWrapper: WorkspacePath;
		filteredLocations?: Location[];
		isLoading?: boolean;
		searchQuery?: string;
		startNewEntry: () => void;
		loadFromEntry: (_location: Location) => void;
	};

	let {
		workSpaceWrapper,
		filteredLocations = [],
		isLoading = false,
		searchQuery = $bindable(''),
		startNewEntry,
		loadFromEntry
	}: Props = $props();
</script>

<div class="space-y-3">
	{#if workSpaceWrapper.isCragEditor()}
		<button type="button" class="btn-primary w-full gap-2" onclick={startNewEntry}>
			<i class="fa-solid fa-plus" aria-hidden="true"></i>{$_('ui.new_crag')}
		</button>
	{/if}

	<div class="relative">
		<i
			class="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-warm-gray-400"
			aria-hidden="true"
		></i>
		<input
			type="search"
			placeholder={$_('ui.search_crags')}
			aria-label={$_('ui.search_crags')}
			bind:value={searchQuery}
			class="input-studio w-full pl-9!"
		/>
	</div>

	<div class="custom-scrollbar relative max-h-[55dvh] space-y-1 overflow-y-auto pr-1">
		{#if isLoading}
			<div
				class="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-white/70 backdrop-blur-[1px]"
			>
				<div class="flex flex-col items-center gap-2">
					<i class="fa-solid fa-spinner fa-spin text-xl text-creator-blue" aria-hidden="true"></i>
					<span class="text-micro-data font-semibold tracking-wider text-near-black uppercase">
						{$_('ui.initializing')}
					</span>
				</div>
			</div>
		{/if}

		{#each filteredLocations as crag}
			<div
				class="rounded-sm border border-transparent bg-white transition-colors hover:border-black/10"
			>
				<button
					type="button"
					class="group flex w-full items-center justify-between gap-3 rounded-sm p-2.5 text-left transition-colors hover:bg-black/[0.04] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue"
					onclick={() => loadFromEntry(crag)}
					disabled={isLoading}
				>
					<div class="min-w-0">
						<div
							class="text-body-text truncate font-semibold text-near-black transition-colors group-hover:text-creator-blue"
						>
							{crag.properties.name}
						</div>
						<div class="text-micro-data truncate text-warm-gray-400">{crag.entryPath}</div>
					</div>
					<i
						class="fa-solid fa-chevron-right shrink-0 text-[10px] text-warm-gray-300 transition-colors group-hover:text-creator-blue"
						aria-hidden="true"
					></i>
				</button>
			</div>
		{:else}
			<div class="text-body-text py-8 text-center text-warm-gray-500">
				{$_('ui.no_entries_found')}
			</div>
		{/each}
	</div>
</div>

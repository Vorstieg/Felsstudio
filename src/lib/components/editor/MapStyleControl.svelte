<script>
	let { mapStyle = $bindable('transport'), isExpanded = false, toolOptionsOpen = false } = $props();
	let showMenu = $state(false);
	const styles = ['transport', 'satellite', 'terrain'];
</script>

<div
	class="fixed z-40"
	style:right={isExpanded ? 'calc(20rem + 1.25rem)' : '1.25rem'}
	style:bottom={isExpanded
		? '4.25rem'
		: toolOptionsOpen
			? 'calc(var(--mobile-tool-dock-height, 7.5rem) + var(--mobile-tool-options-height, 0px) + max(0.75rem, env(safe-area-inset-bottom)) + 3rem)'
			: 'calc(var(--info-panel-height, 0px) + var(--mobile-tool-dock-height, 7.5rem) + max(0.75rem, env(safe-area-inset-bottom)) + 3rem)'}
>
	{#if showMenu}
		<div class="absolute right-0 bottom-12 flex min-w-32 flex-col gap-0.5 rounded-lg border border-black/10 bg-white p-1.5 shadow-panel">
			{#each styles as style}
				<button
					type="button"
					class={`rounded-md px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider ${mapStyle === style ? 'bg-creator-blue text-white' : 'text-warm-gray-600 hover:bg-black/5'}`}
					onclick={() => {
						mapStyle = style;
						showMenu = false;
					}}
				>
					{style}
				</button>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		class="flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-warm-gray-600 shadow-panel transition-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-creator-blue"
		onclick={() => (showMenu = !showMenu)}
		title="Change map style"
		aria-label="Change map style"
		aria-expanded={showMenu}
	>
		<i class="fa-solid fa-layer-group text-sm"></i>
	</button>
</div>

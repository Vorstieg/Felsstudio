<script lang="ts">
	import { slide } from 'svelte/transition';
	import { _ } from 'svelte-i18n';

	type Props = {
		selectedTags?: unknown;
		availableTags?: readonly string[];
		small?: boolean;
		onChange?: (_tags: string[]) => void;
	};

	let {
		selectedTags = $bindable<string[] | undefined>(),
		availableTags = [],
		small = false,
		onChange
	}: Props = $props();

	let isOpen = $state(false);
	let container: HTMLDivElement | undefined = $state();
	let normalizedSelectedTags = $derived(
		Array.isArray(selectedTags)
			? selectedTags.filter((tag): tag is string => typeof tag === 'string')
			: []
	);

	function addTag(tag: string) {
		if (!normalizedSelectedTags.includes(tag)) {
			const nextTags = [...normalizedSelectedTags, tag];
			selectedTags = nextTags;
			onChange?.(nextTags);
		}
	}

	function removeTag(tag: string) {
		const nextTags = normalizedSelectedTags.filter((selectedTag) => selectedTag !== tag);
		selectedTags = nextTags;
		onChange?.(nextTags);
	}

	function handleClickOutside(event: MouseEvent) {
		if (container && event.target instanceof Node && !container.contains(event.target) && isOpen) {
			isOpen = false;
		}
	}

	let unusedTags = $derived(availableTags.filter((tag) => !normalizedSelectedTags.includes(tag)));
</script>

<svelte:window onclick={handleClickOutside} />

<div class="w-full" bind:this={container}>
	<div class="flex flex-wrap items-center gap-1">
			{#if normalizedSelectedTags.length > 0}
				{#each normalizedSelectedTags as tag}
				<button
					class="flex items-center gap-1 {small
						? 'h-5 px-1.5 text-[9px]'
						: 'px-2 py-1 text-[10px]'} rounded-sm font-bold uppercase tracking-widest bg-black/5 border border-black/10 text-near-black hover:bg-black/10 transition-none cursor-pointer group"
					onclick={() => removeTag(tag)}
					title={$_('ui.remove')}
				>
					{$_('tags.' + tag)}
					<i class="fa-solid fa-xmark text-[8px] opacity-30 group-hover:opacity-100 transition-none"
					></i>
				</button>
			{/each}
		{/if}

		<div class="relative">
			<button
				class="flex items-center gap-1 {small
					? 'h-5 px-1.5 text-[9px]'
					: 'px-2 py-1 text-[10px]'} rounded-sm font-bold uppercase tracking-widest border border-dashed border-black/20 text-warm-gray-400 hover:text-near-black hover:border-black/40 hover:bg-black/5 transition-none cursor-pointer"
				onclick={() => (isOpen = !isOpen)}
			>
				<i class="fa-solid fa-plus text-[8px]"></i>
				{$_('ui.tag')}
			</button>

			{#if isOpen}
				<div
					class="absolute left-0 {small
						? 'bottom-full mb-1 w-44 max-h-36'
						: 'top-full mt-1 w-48 max-h-64'} bg-white rounded-sm shadow-modal border border-black/15 z-[100] overflow-y-auto py-1 custom-scrollbar"
					transition:slide={{ duration: 100 }}
				>
					{#if unusedTags.length === 0}
						<div class="px-3 py-2 text-[9px] text-warm-gray-400 italic font-bold uppercase">
							{$_('ui.no_more_tags')}
						</div>
					{:else}
						{#each unusedTags as tag}
							<button
								class="w-full text-left px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none cursor-pointer block"
								onclick={() => {
									addTag(tag);
									isOpen = false;
								}}
							>
								{$_('tags.' + tag)}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 3px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 0px;
	}
</style>

<script>
	import { onMount } from 'svelte';
	import TreeFolderSelector from './TreeFolderSelector.svelte';

	let {
		parentPath = $bindable(''),
		cragSlug = $bindable(''),
		knownFolders = new Set(),
		hierarchyError = '',
		onClose
	} = $props();

	let modalCard = $state();

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));

	const breadcrumbParts = $derived(getBreadcrumbParts(finalPath));

	onMount(() => {
		modalCard?.focus();
	});

	function getBreadcrumbParts(path = '') {
		const normalized = normalizePath(path);
		if (!normalized) return [];
		return normalized.split('/').filter(Boolean);
	}

	function handleBackdropClick(event) {
		if (event.target === event.currentTarget) onClose?.();
	}

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose?.();
		}
	}

	function handleBackdropKeydown(event) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClose?.();
		}
	}
</script>

<div
	class="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
	onclick={handleBackdropClick}
	onkeydown={handleBackdropKeydown}
	role="button"
	tabindex="-1"
	aria-label="Close dialog"
>
	<div
		bind:this={modalCard}
		role="dialog"
		aria-modal="true"
		aria-labelledby="hierarchy-modal-title"
		tabindex="-1"
		class="bg-white w-full max-w-xl max-h-[85vh] rounded shadow-modal border border-black/15 flex flex-col overflow-hidden outline-none"
		onclick={(e) => e.stopPropagation()}
		onkeydown={handleKeydown}
	>
		<!-- Header -->
		<div class="p-3 border-b border-black/15 flex justify-between items-center bg-white flex-shrink-0">
			<div>
				<h2 id="hierarchy-modal-title" class="text-section-title leading-none mb-0.5">Hierarchy Placement</h2>
				<p class="text-ui-label !m-0">Choose where this crag lives in the folder tree</p>
			</div>
			<button
				onclick={onClose}
				aria-label="Close"
				class="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-black/5 transition-none border border-transparent hover:border-black/10"
			>
				<i class="fa-solid fa-xmark text-near-black text-sm"></i>
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
			<!-- Final path preview -->
			<div class="rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2.5 space-y-1">
				<span class="text-ui-label block">Final folder path</span>
				<div class="flex flex-wrap items-center gap-1 text-[12px] font-mono font-medium text-near-black">
					{#if breadcrumbParts.length === 0}
						<span class="text-warm-gray-400 italic">No folder selected</span>
					{:else}
						{#each breadcrumbParts as part, i}
							{#if i > 0}
								<i class="fa-solid fa-chevron-right text-[9px] text-warm-gray-300"></i>
							{/if}
							<span class={i === breadcrumbParts.length - 1 ? 'text-creator-blue font-bold' : ''}>{part}</span>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Parent folder selector -->
			<TreeFolderSelector {knownFolders} bind:selectedPath={parentPath} />

			{#if hierarchyError}
				<p class="text-[10px] text-amber-600 font-bold">{hierarchyError}</p>
			{/if}
		</div>

		<!-- Footer -->
		<div class="p-3 border-t border-black/15 bg-white flex justify-end flex-shrink-0 gap-2">
			<button onclick={onClose} class="btn-primary !px-6 shadow-sm">
				<i class="fa-solid fa-check mr-2 opacity-60"></i>
				Done
			</button>
		</div>
	</div>
</div>

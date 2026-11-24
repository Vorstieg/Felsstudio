<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { normalizePath } from '$lib/components/editor/crag/crag-editor-paths.ts';
	import type { HierarchySuggestion } from './crag-hierarchy-suggestions.ts';
	import TreeFolderSelector from './TreeFolderSelector.svelte';

	type Props = {
		parentPath?: string;
		cragSlug?: string;
		knownFolders?: Set<string>;
		hierarchyError?: string;
		suggestions?: HierarchySuggestion[];
		isSuggesting?: boolean;
		onClose?: () => void;
		onCancel?: () => void;
	};
	let {
		parentPath = $bindable(''),
		cragSlug = $bindable(''),
		knownFolders = new Set(),
		hierarchyError = '',
		suggestions = [],
		isSuggesting = false,
		onClose,
		onCancel = onClose
	}: Props = $props();

	let modalCard = $state<HTMLDivElement>();

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));

	const breadcrumbParts = $derived(getBreadcrumbParts(finalPath));

	onMount(() => {
		modalCard?.focus();
	});

	function getBreadcrumbParts(path = ''): string[] {
		const normalized = normalizePath(path);
		if (!normalized) return [];
		return normalized.split('/').filter(Boolean);
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) onCancel?.();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel?.();
		}
	}

	function handleBackdropKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onCancel?.();
		}
	}
</script>

<div
	class="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
	onclick={handleBackdropClick}
	onkeydown={handleBackdropKeydown}
	role="button"
	tabindex="-1"
	aria-label={$_('editor.close_dialog')}
>
	<div
		bind:this={modalCard}
		role="dialog"
		aria-modal="true"
		aria-labelledby="hierarchy-modal-title"
		tabindex="-1"
		class="bg-white w-full max-w-xl max-h-[85vh] rounded-sm shadow-modal border border-black/15 flex flex-col overflow-hidden outline-none"
		onclick={(e) => e.stopPropagation()}
		onkeydown={handleKeydown}
	>
		<!-- Header -->
		<div
			class="p-3 border-b border-black/15 flex justify-between items-center bg-white flex-shrink-0"
		>
			<div>
				<h2 id="hierarchy-modal-title" class="text-section-title leading-none mb-0.5">
					{$_('editor.hierarchy_placement')}
				</h2>
				<p class="text-ui-label !m-0">
					{$_('editor.choose_where_this_crag_lives_in_the_folder_tree')}
				</p>
			</div>
			<button
				onclick={onCancel}
				aria-label={$_('editor.close')}
				class="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-black/5 transition-none border border-transparent hover:border-black/10"
			>
				<i class="fa-solid fa-xmark text-near-black text-sm"></i>
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
			<!-- Final path preview -->
			<div class="rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2.5 space-y-1">
				<span class="text-ui-label block">{$_('editor.final_folder_path')}</span>
				<div
					class="flex flex-wrap items-center gap-1 text-[12px] font-mono font-medium text-near-black"
				>
					{#if breadcrumbParts.length === 0}
						<span class="text-warm-gray-400 italic">{$_('editor.no_folder_selected')}</span>
					{:else}
						{#each breadcrumbParts as part, i}
							{#if i > 0}
								<i class="fa-solid fa-chevron-right text-[9px] text-warm-gray-300"></i>
							{/if}
							<span class={i === breadcrumbParts.length - 1 ? 'text-creator-blue font-bold' : ''}
								>{part}</span
							>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Location-based suggestions -->
			{#if isSuggesting || suggestions.length > 0}
				<div class="space-y-2 rounded-sm border border-black/10 bg-warm-white/80 p-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-ui-label flex items-center gap-1.5">
							<i class="fa-solid fa-location-dot text-creator-blue" aria-hidden="true"></i>
							{$_('editor.location_suggestions')}
						</span>
						{#if isSuggesting}
							<i class="fa-solid fa-spinner fa-spin text-[10px] text-creator-blue" aria-hidden="true"
							></i>
						{/if}
					</div>
					{#if suggestions.length > 0}
						<div class="flex flex-col gap-1.5">
							{#each suggestions as suggestion}
								{@const isSelected = normalizePath(parentPath) === normalizePath(suggestion.parentPath)}
								<button
									type="button"
									onclick={() => (parentPath = suggestion.parentPath)}
									class={`flex w-full items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-left transition-none ${
										isSelected
											? 'border-creator-blue bg-creator-blue/10'
											: 'border-black/10 bg-white hover:border-creator-blue/40 hover:bg-creator-blue/[0.03]'
									}`}
								>
									<div class="min-w-0 flex-1">
										<p class="truncate text-body-text font-semibold text-near-black">
											{suggestion.label}
										</p>
										<p class="truncate font-mono text-micro-data text-warm-gray-500">
											{suggestion.parentPath}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-1">
										<span
											class="rounded-sm bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-warm-gray-600"
										>
											{$_(
												suggestion.source === 'polygon'
													? 'editor.suggestion_source_polygon'
													: 'editor.suggestion_source_geocoder'
											)}
										</span>
										{#if suggestion.isNewFolder}
											<span
												class="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
											>
												{$_('editor.new_folder_badge')}
											</span>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

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
				{$_('editor.done')}
			</button>
		</div>
	</div>
</div>

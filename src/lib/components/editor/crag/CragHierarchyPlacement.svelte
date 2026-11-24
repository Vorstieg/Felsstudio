<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getDraftEditor } from '../use-draft-editor.svelte';
	const cragEditorState = getCragEditorSession();
	const draft = getDraftEditor();
	import { listDir } from '$lib/api/felslager.ts';
	import { fetchCragsFromManifest } from '$lib/assets/js/fetchCrags.ts';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.ts';
	import { maptilerApiKey } from '$lib/config.ts';
	import CragHierarchyModal from './CragHierarchyModal.svelte';
	import { slugifyName, normalizePath } from '$lib/components/editor/crag/crag-editor-paths.ts';
	import { destinationEntryExists } from './crag-hierarchy-destination.ts';
	import {
		shouldAutoApplyHierarchySuggestion,
		suggestHierarchyFromLocation,
		type HierarchyManifestEntry,
		type HierarchySuggestion
	} from './crag-hierarchy-suggestions.ts';
	import type { ApiListEntry } from '$lib/types/api';

	let { compact = false }: { compact?: boolean } = $props();
	let knownFolders = $state<Set<string>>(new Set());
	let foldersLoaded = $state(false);
	let manifestEntries = $state<HierarchyManifestEntry[]>([]);
	let manifestLoaded = $state(false);
	let hierarchyError = $state('');
	let suggestions = $state<HierarchySuggestion[]>([]);
	let isSuggesting = $state(false);
	let autoSuggested = $state<HierarchySuggestion | null>(null);
	let manualSelectionByNode = $state<Record<string, boolean>>({});
	let autoAppliedPathByNode = $state<Record<string, string>>({});
	let activeNode = $derived(cragEditorState.getActiveWorkspaceEntry());
	let activeEntry = $derived(cragEditorState.getActiveEntry());
	let activeNodeKey = $derived(activeNode?.clientId || activeEntry?.properties.id || '');
	let isReviewDraft = $derived(Boolean(draft?.reviewId));
	let isNewUnsavedEntry = $derived(Boolean(activeNode && !activeNode.sourcePath));
	let parentPath = $derived(normalizePath(activeNode?.path || ''));
	let currentEntryPath = $derived(
		activeNode ? normalizePath(cragEditorState.getWorkspaceEntryPath(activeNode)) : ''
	);
	let coordinates = $derived(getGeometryCenter(activeEntry?.geometry));
	let coordinateKey = $derived(
		coordinates ? `${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}` : ''
	);
	let entryKind = $derived(activeEntry?.properties.kind || 'crag');
	let draftParentPath = $state('');
	let cragSlug = $state('');
	let showModal = $state(false);
	let checkingDestination = false;
	let destinationCheck = 0;
	let suggestionAbort: AbortController | null = null;

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));
	const breadcrumbParts = $derived(getBreadcrumbParts(finalPath));
	const topSuggestion = $derived(suggestions[0] ?? null);
	const canApplyTopSuggestion = $derived(
		Boolean(topSuggestion && normalizePath(topSuggestion.parentPath) !== parentPath)
	);

	onMount(() => {
		void loadHierarchyOptions();
		void loadManifestEntries();
	});

	onDestroy(() => {
		suggestionAbort?.abort();
	});

	async function loadHierarchyOptions() {
		try {
			const files: ApiListEntry[] = await listDir('', { recursive: true });
			const folders = new Set(['']);
			for (const file of files || []) {
				if (!file.path) continue;
				const parts = file.path.split('/').filter(Boolean);
				const isFile = file.type === 'file' || /\.[^/]+$/.test(parts.at(-1) || '');
				const folderParts = isFile ? parts.slice(0, -1) : parts;
				for (let i = 1; i <= folderParts.length; i++) {
					folders.add(folderParts.slice(0, i).join('/'));
				}
			}
			knownFolders = folders;
		} catch (err: unknown) {
			console.error('Failed to load hierarchy options:', err);
			hierarchyError = $_('editor.could_not_load_existing_folders');
		} finally {
			foldersLoaded = true;
		}
	}

	async function loadManifestEntries() {
		try {
			const entries = await fetchCragsFromManifest({ limit: -1 });
			manifestEntries = entries.map((entry) => ({
				entryPath: entry.entryPath,
				geometry: entry.geometry,
				properties: {
					id: entry.properties.id,
					name: entry.properties.name,
					kind: entry.properties.kind,
					type: entry.properties.type
				}
			}));
		} catch {
			// Manifest is optional in offline/local sessions; Tier 3 geocoding can still suggest paths.
			manifestEntries = [];
		} finally {
			manifestLoaded = true;
		}
	}

	function getBreadcrumbParts(path = ''): string[] {
		const normalized = normalizePath(path);
		if (!normalized) return [];
		return normalized.split('/').filter(Boolean);
	}

	$effect(() => {
		cragSlug = activeEntry?.properties.id || slugifyName(activeEntry?.properties.name || '');
	});

	$effect(() => {
		void activeNodeKey;
		autoSuggested = null;
	});

	$effect(() => {
		if (!foldersLoaded || !manifestLoaded || !coordinateKey || !coordinates) {
			suggestions = [];
			return;
		}
		const coords: [number, number] = [coordinates[0], coordinates[1]];
		const kind = entryKind;
		const excludePath = currentEntryPath;
		const foldersSnapshot = knownFolders;
		const manifestSnapshot = manifestEntries;
		const nodeKey = activeNodeKey;
		const currentParent = parentPath;
		const shouldAutoApply = shouldAutoApplyHierarchySuggestion({
			isReview: isReviewDraft,
			hasSourcePath: Boolean(activeNode?.sourcePath),
			hasManualSelection: Boolean(manualSelectionByNode[nodeKey]),
			currentParentPath: currentParent,
			lastAutoAppliedParentPath: autoAppliedPathByNode[nodeKey] ?? null
		});

		suggestionAbort?.abort();
		const controller = new AbortController();
		suggestionAbort = controller;

		const timer = setTimeout(() => {
			isSuggesting = true;
			void suggestHierarchyFromLocation({
				coordinates: coords,
				entryKind: kind,
				manifestEntries: manifestSnapshot,
				knownFolders: foldersSnapshot,
				apiKey: maptilerApiKey,
				excludePath,
				signal: controller.signal
			})
				.then((result) => {
					if (controller.signal.aborted || activeNodeKey !== nodeKey) return;
					suggestions = result;
					const best = result[0] ?? null;
					if (shouldAutoApply && best && normalizePath(best.parentPath) !== parentPath) {
						applySuggestedParent(best, { manual: false });
					} else if (
						!isReviewDraft &&
						best &&
						normalizePath(best.parentPath) === parentPath &&
						isNewUnsavedEntry &&
						autoAppliedPathByNode[nodeKey] === parentPath
					) {
						autoSuggested = best;
					}
				})
				.catch((error) => {
					if (error instanceof Error && error.name === 'AbortError') return;
					suggestions = [];
				})
				.finally(() => {
					if (!controller.signal.aborted) isSuggesting = false;
				});
		}, 300);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function clearAutoAppliedPath(nodeKey: string) {
		if (!nodeKey || !(nodeKey in autoAppliedPathByNode)) return;
		const { [nodeKey]: _removed, ...rest } = autoAppliedPathByNode;
		autoAppliedPathByNode = rest;
	}

	function applySuggestedParent(
		suggestion: HierarchySuggestion,
		{ manual = true }: { manual?: boolean } = {}
	) {
		const node = cragEditorState.getActiveWorkspaceEntry();
		if (!node) return;
		const nodeKey = node.clientId || node.entry?.properties.id || '';
		const entryPath = cragEditorState.getWorkspaceEntryPath(node);
		const destinationParent = normalizePath(suggestion.parentPath);
		const destination = normalizePath(
			[destinationParent, node.entry?.properties.id || node.id].filter(Boolean).join('/')
		);
		if (entryPath === destination) {
			autoSuggested = suggestion;
			return;
		}
		if (cragEditorState.getWorkspaceEntry(destination)) return;
		if (nodeKey) {
			if (manual) {
				manualSelectionByNode = { ...manualSelectionByNode, [nodeKey]: true };
				clearAutoAppliedPath(nodeKey);
			} else {
				autoAppliedPathByNode = { ...autoAppliedPathByNode, [nodeKey]: destinationParent };
			}
		}
		cragEditorState.remapWorkspacePaths(entryPath, destinationParent);
		hierarchyError = '';
		autoSuggested = suggestion;
	}

	function openModal() {
		draftParentPath = parentPath;
		showModal = true;
	}

	function cancelModal() {
		destinationCheck++;
		checkingDestination = false;
		showModal = false;
		hierarchyError = '';
	}

	async function closeModal() {
		if (checkingDestination) return;
		const node = cragEditorState.getActiveWorkspaceEntry();
		const entryPath = node ? cragEditorState.getWorkspaceEntryPath(node) : null;
		const destinationParent = normalizePath(draftParentPath);
		const destination = normalizePath(
			[destinationParent, node?.entry?.properties.id || node?.id].filter(Boolean).join('/')
		);
		if (node && entryPath !== destination) {
			if (cragEditorState.getWorkspaceEntry(destination)) {
				hierarchyError = $_('editor.destination_exists', { values: { destination } });
				return;
			}
			checkingDestination = true;
			const checkId = ++destinationCheck;
			try {
				const exists = await destinationEntryExists(
					destinationParent,
					String(node.entry?.properties.id || node.id || '')
				);
				if (checkId !== destinationCheck) return;
				if (exists) {
					hierarchyError = $_('editor.destination_exists', { values: { destination } });
					return;
				}
			} catch {
				if (checkId !== destinationCheck) return;
				hierarchyError = $_('editor.could_not_check_the_destination_folder');
				return;
			} finally {
				if (checkId === destinationCheck) checkingDestination = false;
			}
			if (checkId !== destinationCheck) return;
			cragEditorState.remapWorkspacePaths(entryPath ?? '', destinationParent);
			if (activeNodeKey) {
				manualSelectionByNode = { ...manualSelectionByNode, [activeNodeKey]: true };
				clearAutoAppliedPath(activeNodeKey);
			}
			autoSuggested =
				suggestions.find((item) => normalizePath(item.parentPath) === destinationParent) ?? null;
		}
		hierarchyError = '';
		showModal = false;
	}
</script>

{#if compact}
	<button
		type="button"
		onclick={openModal}
		class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-creator-blue transition-none hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue"
		title={$_('editor.edit_hierarchy_placement')}
		aria-label={$_('editor.edit_hierarchy')}
	>
		<i class="fa-solid fa-pen text-[9px]" aria-hidden="true"></i>
	</button>
{:else}
	<div class="space-y-2 rounded-sm border border-black/10 bg-black/[0.03] p-2">
		<div class="flex items-start justify-between gap-2">
			<div>
				<span class="text-ui-label block">{$_('editor.hierarchy_placement')}</span>
				<p class="text-micro-data text-warm-gray-400">
					{$_('editor.hierarchy_parent_hint')}
				</p>
			</div>
		</div>

		<button
			type="button"
			onclick={openModal}
			class="w-full text-left rounded-sm border border-black/15 bg-white p-2 shadow-sm hover:border-creator-blue/40 hover:bg-creator-blue/[0.02] transition-none group"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0 flex-1">
					{#if breadcrumbParts.length === 0}
						<span class="text-micro-data text-warm-gray-400 italic"
							>{$_('editor.no_folder_selected')}</span
						>
					{:else}
						<div
							class="flex flex-wrap items-center gap-1 text-[12px] font-mono font-medium text-near-black"
						>
							{#each breadcrumbParts as part, i}
								{#if i > 0}
									<i class="fa-solid fa-chevron-right text-[9px] text-warm-gray-300"></i>
								{/if}
								<span class={i === breadcrumbParts.length - 1 ? 'text-creator-blue font-bold' : ''}
									>{part}</span
								>
							{/each}
						</div>
					{/if}
				</div>
				<span
					class="text-ui-label text-creator-blue group-hover:text-creator-blue-active whitespace-nowrap"
				>
					<i class="fa-solid fa-pen text-[10px] mr-1"></i>{$_('editor.edit')}
				</span>
			</div>
		</button>

		{#if isSuggesting}
			<p class="flex items-center gap-1.5 text-micro-data text-warm-gray-500">
				<i class="fa-solid fa-spinner fa-spin text-[10px] text-creator-blue" aria-hidden="true"></i>
				<span>{$_('editor.suggesting_from_location')}</span>
			</p>
		{:else if autoSuggested && normalizePath(autoSuggested.parentPath) === parentPath}
			<p class="flex flex-wrap items-center gap-1.5 text-micro-data text-warm-gray-500">
				<span
					class="inline-flex items-center gap-1 rounded-sm bg-creator-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-creator-blue"
				>
					<i class="fa-solid fa-location-dot text-[9px]" aria-hidden="true"></i>
					{$_('editor.suggested_from_location')}
				</span>
				<span class="truncate">{autoSuggested.label}</span>
			</p>
		{:else if canApplyTopSuggestion && topSuggestion}
			<div
				class="flex items-center justify-between gap-2 rounded-sm border border-creator-blue/20 bg-creator-blue/5 px-2 py-1.5"
			>
				<div class="min-w-0 flex-1">
					<p class="text-[10px] font-semibold text-near-black truncate">
						<i class="fa-solid fa-location-dot mr-1 text-creator-blue" aria-hidden="true"></i>
						{topSuggestion.label}
					</p>
					<p class="font-mono text-[10px] text-warm-gray-500 truncate">
						{topSuggestion.parentPath}
					</p>
				</div>
				<button
					type="button"
					onclick={() => applySuggestedParent(topSuggestion, { manual: true })}
					class="shrink-0 rounded-sm border border-creator-blue/30 bg-white px-2 py-1 text-[10px] font-bold whitespace-nowrap text-creator-blue hover:bg-creator-blue hover:text-white"
				>
					{$_('editor.apply_location_suggestion')}
				</button>
			</div>
		{/if}

		{#if hierarchyError}
			<p class="text-[10px] text-amber-600 font-bold">{hierarchyError}</p>
		{/if}
	</div>
{/if}

{#if showModal}
	<CragHierarchyModal
		bind:cragSlug
		{knownFolders}
		{hierarchyError}
		{suggestions}
		{isSuggesting}
		bind:parentPath={draftParentPath}
		onClose={closeModal}
		onCancel={cancelModal}
	/>
{/if}

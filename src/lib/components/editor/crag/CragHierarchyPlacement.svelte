<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	const cragEditorState = getCragEditorSession();
	import { listDir } from '$lib/api/felslager.ts';
	import CragHierarchyModal from './CragHierarchyModal.svelte';
	import { slugifyName, normalizePath } from '$lib/components/editor/crag/crag-editor-paths.ts';
	import { destinationEntryExists } from './crag-hierarchy-destination.ts';
	import type { ApiListEntry } from '$lib/types/api';

	let { compact = false }: { compact?: boolean } = $props();
	let knownFolders = $state<Set<string>>(new Set());
	let hierarchyError = $state('');
	let activeEntry = $derived(cragEditorState.getActiveEntry());
	let parentPath = $derived(normalizePath(cragEditorState.getActiveWorkspaceEntry()?.path || ''));
	let draftParentPath = $state('');
	let cragSlug = $state('');
	let showModal = $state(false);
	let checkingDestination = false;
	let destinationCheck = 0;

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));
	const breadcrumbParts = $derived(getBreadcrumbParts(finalPath));

	onMount(loadHierarchyOptions);

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
			} catch (error) {
				if (checkId !== destinationCheck) return;
				hierarchyError = $_('editor.could_not_check_the_destination_folder');
				return;
			} finally {
				if (checkId === destinationCheck) checkingDestination = false;
			}
			if (checkId !== destinationCheck) return;
			cragEditorState.remapWorkspacePaths(entryPath ?? '', destinationParent);
		}
		hierarchyError = '';
		showModal = false;
	}
</script>

{#if compact}
	<button
		type="button"
		onclick={openModal}
		class="rounded-sm px-1.5 py-1 text-micro-data font-bold text-creator-blue hover:bg-white"
		title={$_('editor.edit_hierarchy_placement')}
	>
		<i class="fa-solid fa-pen text-[10px] mr-1"></i>{$_('editor.edit_hierarchy')}
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
		bind:parentPath={draftParentPath}
		onClose={closeModal}
		onCancel={cancelModal}
	/>
{/if}

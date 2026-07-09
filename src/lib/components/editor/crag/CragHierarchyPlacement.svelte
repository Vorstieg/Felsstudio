<script>
	import { onMount } from 'svelte';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { listDir } from '$lib/api/felslager.js';
	import { normalizeEntryPath } from '$lib/assets/js/sector-utils.js';
	import CragHierarchyModal from './CragHierarchyModal.svelte';
	import { slugifyName, normalizePath } from '$lib/components/editor/crag/crag-editor-paths.js';

	let knownFolders = $state(new Set());
	let hierarchyError = $state('');
	let parentPath = $state('');
	let cragSlug = $state('');
	let lastBuiltPath = '';
	let showModal = $state(false);

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));
	const breadcrumbParts = $derived(getBreadcrumbParts(finalPath));

	onMount(loadHierarchyOptions);

	async function loadHierarchyOptions() {
		try {
			const files = await listDir('', { recursive: true });
			const folders = new Set(['']);
			for (const file of files || []) {
				const path = normalizePath(normalizeEntryPath(file.path || ''));
				if (!path) continue;
				const parts = path.split('/').filter(Boolean);
				const isFile = file.type === 'file' || /\.[^/]+$/.test(parts.at(-1) || '');
				const folderParts = isFile ? parts.slice(0, -1) : parts;
				for (let i = 1; i <= folderParts.length; i++) {
					folders.add(folderParts.slice(0, i).join('/'));
				}
			}
			knownFolders = folders;
		} catch (err) {
			console.error('Failed to load hierarchy options:', err);
			hierarchyError = 'Could not load existing folders.';
		}
	}

	function getBreadcrumbParts(path = '') {
		const normalized = normalizePath(path);
		if (!normalized) return [];
		return normalized.split('/').filter(Boolean);
	}

	function pathDirname(path = '') {
		const parts = normalizePath(path).split('/').filter(Boolean);
		return parts.slice(0, -1).join('/');
	}

	function pathBasename(path = '') {
		return normalizePath(path).split('/').filter(Boolean).at(-1) || '';
	}

	function syncFromCragPath(path) {
		const normalized = normalizePath(path);
		parentPath = pathDirname(normalized);
		cragSlug = pathBasename(normalized);
	}

	function updateCragPath(nextParentPath = parentPath, nextCragSlug = cragSlug) {
		const nextPath = normalizePath([nextParentPath, nextCragSlug].filter(Boolean).join('/'));
		if (!nextPath) return;
		lastBuiltPath = nextPath;
		if (cragEditorState.crag.path !== nextPath) cragEditorState.crag.path = nextPath;
	}

	$effect(() => {
		const currentPath = normalizePath(cragEditorState.crag.path);
		if (currentPath && currentPath !== lastBuiltPath && currentPath !== finalPath) {
			syncFromCragPath(currentPath);
			lastBuiltPath = currentPath;
		}
	});

	$effect(() => {
		cragSlug = slugifyName(cragEditorState.crag.name);
	});

	$effect(() => {
		updateCragPath();
	});
</script>

<div class="space-y-2 rounded-sm border border-black/10 bg-black/[0.03] p-2">
	<div class="flex items-start justify-between gap-2">
		<div>
			<span class="text-ui-label block">Hierarchy Placement</span>
			<p class="text-micro-data text-warm-gray-400">Choose the parent folder. The crag folder is generated from the
				name.</p>
		</div>
	</div>

	<button
		type="button"
		onclick={() => showModal = true}
		class="w-full text-left rounded-sm border border-black/15 bg-white p-2 shadow-sm hover:border-creator-blue/40 hover:bg-creator-blue/[0.02] transition-none group"
	>
		<div class="flex items-center justify-between gap-2">
			<div class="min-w-0 flex-1">
				{#if breadcrumbParts.length === 0}
					<span class="text-micro-data text-warm-gray-400 italic">No folder selected</span>
				{:else}
					<div class="flex flex-wrap items-center gap-1 text-[12px] font-mono font-medium text-near-black">
						{#each breadcrumbParts as part, i}
							{#if i > 0}
								<i class="fa-solid fa-chevron-right text-[9px] text-warm-gray-300"></i>
							{/if}
							<span class={i === breadcrumbParts.length - 1 ? 'text-creator-blue font-bold' : ''}>{part}</span>
						{/each}
					</div>
				{/if}
			</div>
			<span class="text-ui-label text-creator-blue group-hover:text-creator-blue-active whitespace-nowrap">
				<i class="fa-solid fa-pen text-[10px] mr-1"></i>Edit
			</span>
		</div>
	</button>

	{#if hierarchyError}
		<p class="text-[10px] text-amber-600 font-bold">{hierarchyError}</p>
	{/if}
</div>

{#if showModal}
	<CragHierarchyModal
		bind:parentPath
		bind:cragSlug
		cragName={cragEditorState.crag.name}
		{knownFolders}
		{hierarchyError}
		onClose={() => showModal = false}
	/>
{/if}

<script>
	import { onMount } from 'svelte';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { listDir } from '$lib/api/felslager.js';
	import { normalizeEntryPath } from '$lib/assets/js/sector-utils.js';
	import TreeFolderSelector from './TreeFolderSelector.svelte';

	let knownFolders = $state(new Set());
	let hierarchyError = $state('');
	let parentPath = $state('');
	let cragSlug = $state('');
	let lastBuiltPath = '';

	const finalPath = $derived(normalizePath([parentPath, cragSlug].filter(Boolean).join('/')));

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

	function normalizePath(path = '') {
		return String(path).replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
	}

	function pathDirname(path = '') {
		const parts = normalizePath(path).split('/').filter(Boolean);
		return parts.slice(0, -1).join('/');
	}

	function pathBasename(path = '') {
		return normalizePath(path).split('/').filter(Boolean).at(-1) || '';
	}

	function slugifyName(value, fallback = 'new-crag') {
		return (value || fallback)
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || fallback;
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
	<div>
		<label class="text-ui-label block">Hierarchy Placement</label>
		<p class="text-micro-data text-warm-gray-400">Choose the parent folder. The crag folder is generated from the name.</p>
	</div>

	<TreeFolderSelector {knownFolders} bind:selectedPath={parentPath} />

	{#if hierarchyError}
		<p class="text-[10px] text-amber-600 font-bold">{hierarchyError}</p>
	{/if}
</div>

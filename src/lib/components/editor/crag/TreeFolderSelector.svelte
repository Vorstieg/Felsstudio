<script>
	let { knownFolders = new Set(), selectedPath = $bindable('') } = $props();

	let isOpen = $state(false);
	let search = $state('');
	let expandedFolders = $state(new Set());
	let pendingFolders = $state(new Set());
	let newFolderName = $state('');
	let missingFolderPath = $state('');

	const allFolders = $derived(
		Array.from(new Set([...knownFolders, ...pendingFolders]))
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b))
	);
	const selectedExists = $derived(!selectedPath || allFolders.includes(normalizePath(selectedPath)));
	const visibleFolders = $derived(getVisibleFolders());

	function normalizePath(path = '') {
		return String(path).replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
	}

	function pathBasename(path = '') {
		return normalizePath(path).split('/').filter(Boolean).at(-1) || '';
	}

	function slugifyName(value, fallback = 'new-folder') {
		return (value || fallback)
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || fallback;
	}

	function getFolderName(path = '') {
		return pathBasename(path) || path;
	}

	function getFolderDepth(path = '') {
		return normalizePath(path).split('/').filter(Boolean).length - 1;
	}

	function hasChildFolders(path) {
		const prefix = `${normalizePath(path)}/`;
		return allFolders.some((option) => option.startsWith(prefix));
	}

	function toggleFolder(path) {
		const next = new Set(expandedFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		expandedFolders = next;
	}

	function isFolderVisible(path) {
		const parts = normalizePath(path).split('/').filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			if (!expandedFolders.has(parts.slice(0, i).join('/'))) return false;
		}
		return true;
	}

	function selectFolder(path) {
		selectedPath = normalizePath(path);
	}

	function addPendingFolderPath(path, { select = true } = {}) {
		const normalized = normalizePath(path);
		if (!normalized) return;

		const parts = normalized.split('/').filter(Boolean);
		const nextPending = new Set(pendingFolders);
		const nextExpanded = new Set(expandedFolders);

		for (let i = 1; i <= parts.length; i++) {
			const folder = parts.slice(0, i).join('/');
			if (!knownFolders.has(folder)) nextPending.add(folder);
			if (i < parts.length) nextExpanded.add(folder);
		}

		pendingFolders = nextPending;
		expandedFolders = nextExpanded;
		if (select) selectFolder(normalized);
	}

	function createFolderInsideSelectedParent() {
		const slug = slugifyName(newFolderName, 'new-folder');
		const folderPath = normalizePath([selectedPath, slug].filter(Boolean).join('/'));
		addPendingFolderPath(folderPath);
		newFolderName = '';
	}

	function addMissingFolderPath() {
		addPendingFolderPath(missingFolderPath);
		missingFolderPath = '';
	}

	function isPendingFolder(path) {
		return pendingFolders.has(normalizePath(path));
	}

	function getVisibleFolders() {
		const query = search.trim().toLowerCase();
		if (query) {
			return allFolders
				.filter((option) => option.toLowerCase().includes(query))
				.slice(0, 120)
				.map((path) => ({ path, depth: getFolderDepth(path), hasChildren: hasChildFolders(path) }));
		}
		return allFolders
			.filter(isFolderVisible)
			.map((path) => ({ path, depth: getFolderDepth(path), hasChildren: hasChildFolders(path) }));
	}

	$effect(() => {
		const path = normalizePath(selectedPath);
		if (!path) return;
		const parts = path.split('/').filter(Boolean);
		const next = new Set(expandedFolders);
		let changed = false;
		for (let i = 1; i < parts.length; i++) {
			const ancestor = parts.slice(0, i).join('/');
			if (!next.has(ancestor)) {
				next.add(ancestor);
				changed = true;
			}
		}
		if (changed) expandedFolders = next;
	});
</script>

<div class="space-y-0.5">
	<label class="text-ui-label block">Parent folder</label>
	<div class="relative">
		<div class="flex gap-1">
			<input
				bind:value={selectedPath}
				class="input-studio w-full font-mono"
				placeholder="e.g. europe/austria/lower-austria"
			/>
			<button
				type="button"
				class="px-2 rounded-sm border border-black/15 bg-white text-micro-data font-bold hover:border-creator-blue hover:text-creator-blue transition-none"
				onclick={() => (isOpen = !isOpen)}
			>
				Select
			</button>
		</div>

		{#if isOpen}
			<div class="mt-1 rounded-sm border border-black/15 bg-white p-1.5 shadow-panel">
				<input bind:value={search} class="input-studio w-full font-mono mb-1.5" placeholder="Filter folders..." />
				<div class="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
					{#each visibleFolders as item}
						<div
							class="flex items-center gap-0.5 rounded-sm hover:bg-black/5 {item.path === selectedPath ? 'bg-creator-blue/10' : ''}"
							style="padding-left: {item.depth * 0.75}rem"
						>
							<button
								type="button"
								class="w-5 h-6 flex items-center justify-center text-warm-gray-400 hover:text-near-black"
								onclick={() => item.hasChildren && toggleFolder(item.path)}
								disabled={!item.hasChildren}
							>
								{#if item.hasChildren}
									<i class="fa-solid {expandedFolders.has(item.path) || search ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px]"></i>
								{:else}
									<span class="text-[9px]">•</span>
								{/if}
							</button>
							<button
								type="button"
								class="min-w-0 flex-1 px-1 py-1 text-left text-micro-data font-mono transition-none {item.path === selectedPath ? 'text-creator-blue font-bold' : 'text-warm-gray-700'}"
								onclick={() => selectFolder(item.path)}
								title={item.path}
							>
								<i class="fa-solid {item.hasChildren ? 'fa-folder' : 'fa-folder-open'} mr-1 text-[9px] text-warm-gray-400"></i>
								<span class="truncate">{getFolderName(item.path)}</span>
								{#if isPendingFolder(item.path)}
									<span class="ml-1 rounded-sm bg-amber-100 px-1 text-[8px] font-bold uppercase text-amber-700">new</span>
								{/if}
								<span class="block truncate text-[9px] font-normal opacity-60">{item.path}</span>
							</button>
						</div>
					{:else}
						<div class="px-1.5 py-2 text-center text-micro-data text-warm-gray-400">No folders found</div>
					{/each}
				</div>

				<div class="mt-2 border-t border-black/10 pt-2 space-y-2">
					<div class="space-y-1">
						<div class="text-[9px] uppercase tracking-widest font-bold text-warm-gray-400">Create inside selected parent</div>
						<div class="flex gap-1">
							<input bind:value={newFolderName} class="input-studio w-full font-mono" placeholder="new-folder" />
							<button
								type="button"
								class="px-2 rounded-sm bg-near-black text-white text-micro-data font-bold disabled:opacity-40"
								disabled={!newFolderName.trim()}
								onclick={createFolderInsideSelectedParent}
							>
								Create
							</button>
						</div>
					</div>

					<details>
						<summary class="cursor-pointer text-micro-data font-bold text-warm-gray-500 hover:text-near-black">Add missing folder path</summary>
						<div class="flex gap-1 mt-1">
							<input bind:value={missingFolderPath} class="input-studio w-full font-mono" placeholder="europe/austria/new-area" />
							<button
								type="button"
								class="px-2 rounded-sm border border-black/15 bg-white text-micro-data font-bold disabled:opacity-40"
								disabled={!missingFolderPath.trim()}
								onclick={addMissingFolderPath}
							>
								Add
							</button>
						</div>
					</details>
				</div>
			</div>
		{/if}
	</div>
	{#if selectedPath && !selectedExists}
		<p class="text-[10px] text-amber-600 font-bold">Parent folder is not known yet and may be created on save.</p>
	{/if}
</div>

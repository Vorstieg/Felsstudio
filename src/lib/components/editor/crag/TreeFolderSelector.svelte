<script>
	let { knownFolders = new Set(), selectedPath = $bindable('') } = $props();

	let search = $state('');
	let expandedFolders = $state(new Set());

	const allFolders = $derived(
		Array.from(knownFolders)
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b))
	);
	const selectedExists = $derived(!selectedPath || allFolders.includes(normalizePath(selectedPath)));
	const visibleFolders = $derived(getVisibleFolders());

	function pathBasename(path = '') {
		return normalizePath(path).split('/').filter(Boolean).at(-1) || '';
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
	<label for="parent-folder-input" class="text-ui-label block">Parent folder</label>
	<div class="space-y-2">
		<input
			id="parent-folder-input"
			bind:value={selectedPath}
			class="input-studio w-full font-mono"
			placeholder="e.g. europe/austria/lower-austria"
		/>

		<div class="rounded-sm border border-black/15 bg-white p-1.5 shadow-panel">
			<input bind:value={search} class="input-studio w-full font-mono mb-1.5" placeholder="Filter folders..." />
			<div class="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
				{#each visibleFolders as item}
					<button
						type="button"
						class="w-full flex items-center gap-0.5 rounded-sm hover:bg-black/5 text-left {item.path === selectedPath ? 'bg-creator-blue/10' : ''}"
						style="padding-left: {item.depth * 0.75}rem"
						onclick={() => { selectFolder(item.path); if (item.hasChildren) toggleFolder(item.path); }}
						title={item.path}
					>
						<span class="w-5 h-6 flex items-center justify-center text-warm-gray-400">
							{#if item.hasChildren}
								<i class="fa-solid {expandedFolders.has(item.path) || search ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px]"></i>
							{:else}
								<span class="text-[9px]">•</span>
							{/if}
						</span>
						<span class="min-w-0 flex-1 px-1 py-1 text-micro-data font-mono transition-none {item.path === selectedPath ? 'text-creator-blue font-bold' : 'text-warm-gray-700'}">
							<i class="fa-solid {item.hasChildren ? 'fa-folder' : 'fa-folder-open'} mr-1 text-[9px] text-warm-gray-400"></i>
							<span class="truncate">{getFolderName(item.path)}</span>
							<span class="block truncate text-[9px] font-normal opacity-60">{item.path}</span>
						</span>
					</button>
				{:else}
					<div class="px-1.5 py-2 text-center text-micro-data text-warm-gray-400">No folders found</div>
				{/each}
			</div>
		</div>
	</div>
	{#if selectedPath && !selectedExists}
		<p class="text-[10px] text-amber-600 font-bold">Parent folder does not exist yet.</p>
	{/if}
</div>

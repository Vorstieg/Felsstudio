<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { _ } from 'svelte-i18n';
	import { listDir, readFile, writeFile, deleteFile, fileUrl, renameFile } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';

	let currentPath = $derived($page.url.searchParams.get('path') || '');
	let items = $state([]);
	let loadingItems = $state(false);

	let selectedFile = $state(null);
	let selectedFileType = $state(null);
	let fileContent = $state('');
	let saving = $state(false);
	let error = $state(null);

	let searchQuery = $state('');
	let searchResults = $state([]);
	let isSearching = $state(false);
	let allFilesCache = null;

	$effect(() => {
		if (searchQuery.trim().length > 0) {
			const handler = setTimeout(async () => {
				isSearching = true;
				try {
					if (!allFilesCache) {
						allFilesCache = await listDir('', { recursive: true });
					}
					const lowerQuery = searchQuery.toLowerCase();
					searchResults = allFilesCache.filter(item => 
						item.path.toLowerCase().includes(lowerQuery) || 
						item.name.toLowerCase().includes(lowerQuery)
					);
				} catch (e) {
					error = e.message;
				} finally {
					isSearching = false;
				}
			}, 300);
			return () => clearTimeout(handler);
		} else {
			searchResults = [];
		}
	});

	async function loadDirectory(path) {
		loadingItems = true;
		error = null;
		try {
			const rawItems = await listDir(path);
			const cleanPath = path.replace(/\/+$/, '');
			items = rawItems.map(item => ({
				...item,
				path: cleanPath ? `${cleanPath}/${item.name}` : item.name
			}));
		} catch (e) {
			error = e.message;
		} finally {
			loadingItems = false;
		}
	}

	$effect(() => {
		// Only run when currentPath changes
		loadDirectory(currentPath);
	});

	async function openItem(item) {
		if (item.type === 'dir') {
			searchQuery = '';
			selectedFile = null;
			selectedFileType = null;
			fileContent = '';
			const url = new URL(window.location.href);
			url.searchParams.set('path', item.path);
			goto(url.toString(), { keepFocus: true });
		} else {
			const lowerName = item.name.toLowerCase();
			const isJson = lowerName.endsWith('.json');
			const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].some(ext => lowerName.endsWith(ext));
			const isBinary = ['.zip', '.pdf', '.mp4', '.mp3', '.wav', '.exe', '.bin'].some(ext => lowerName.endsWith(ext));

			if (isImage) {
				selectedFile = item;
				selectedFileType = 'image';
				fileContent = '';
				error = null;
			} else if (!isBinary) {
				try {
					const res = await readFile(item.path);
					fileContent = await res.text();
					selectedFile = item;
					selectedFileType = isJson ? 'json' : 'text';
					error = null;
				} catch (e) {
					error = e.message;
				}
			} else {
				error = `Cannot open ${item.name}. Unsupported file type.`;
			}
		}
	}

	function navigateUp() {
		if (!currentPath) return;
		const parts = currentPath.split('/').filter(Boolean);
		parts.pop();
		selectedFile = null;
		selectedFileType = null;
		fileContent = '';
		
		const newPath = parts.join('/');
		const url = new URL(window.location.href);
		if (newPath) {
			url.searchParams.set('path', newPath);
		} else {
			url.searchParams.delete('path');
		}
		goto(url.toString(), { keepFocus: true });
	}

	function saveFile() {
		if (!selectedFile) return;
		if (!authState.requireAuth(saveFileAction)) return;
		saveFileAction();
	}

	async function saveFileAction() {
		saving = true;
		error = null;
		try {
			if (selectedFileType === 'json') {
				// Validate JSON before saving
				JSON.parse(fileContent);
				await writeFile(selectedFile.path, fileContent, 'application/json');
			} else {
				await writeFile(selectedFile.path, fileContent, 'text/plain');
			}
		} catch (e) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	function renameItem(item, e) {
		e.stopPropagation();
		const newName = prompt(`Enter new name for ${item.name}:`, item.name);
		if (!newName || newName === item.name) return;
		
		const parts = item.path.split('/');
		parts.pop();
		const basePath = parts.join('/');
		const newPath = basePath ? `${basePath}/${newName}` : newName;
		
		if (!authState.requireAuth(() => renameItemAction(item, newPath))) return;
		renameItemAction(item, newPath);
	}

	async function renameItemAction(item, newPath) {
		try {
			await renameFile(item.path, newPath);
			if (selectedFile?.path === item.path) {
				selectedFile.path = newPath;
				selectedFile.name = newPath.split('/').pop();
			}
			await loadDirectory(currentPath);
		} catch (err) {
			error = err.message;
		}
	}

	function deleteItem(item, e) {
		e.stopPropagation();
		if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
		if (!authState.requireAuth(() => deleteItemAction(item))) return;
		deleteItemAction(item);
	}

	async function deleteItemAction(item) {
		try {
			await deleteFile(item.path);
			if (selectedFile?.path === item.path) {
				selectedFile = null;
				selectedFileType = null;
				fileContent = '';
			}
			await loadDirectory(currentPath);
		} catch (err) {
			error = err.message;
		}
	}
	
	function getFileIcon(item) {
		if (item.type === 'dir') return 'fa-folder text-amber-500';
		const name = item.name.toLowerCase();
		if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico'].some(e => name.endsWith(e))) return 'fa-image text-emerald-500';
		if (name.endsWith('.json')) return 'fa-file-code text-creator-blue';
		if (['.txt', '.md', '.csv'].some(e => name.endsWith(e))) return 'fa-file-lines text-warm-gray-400';
		return 'fa-file text-warm-gray-400';
	}
	
	let breadcrumbs = $derived(currentPath ? currentPath.split('/').filter(Boolean) : []);
</script>

<div class="creator-studio flex flex-col w-full h-full bg-warm-white text-body-text text-near-black">
	<!-- Header -->
	<header class="flex items-center justify-between px-3 py-3 bg-white border-b border-black/15 shadow-panel z-10 md:px-4">
		<div class="flex min-w-0 items-center gap-2 md:gap-4">
			<button
				class="tool-btn"
				onclick={() => currentPath ? navigateUp() : goto(base + '/')}
				title={currentPath ? 'Go up' : $_('ui.back_to_launcher')}
			>
				<i class="fa-solid fa-arrow-left"></i>
			</button>
			<div class="min-w-0">
				<h1 class="text-section-title leading-tight">{$_('ui.felslager_studio')}</h1>
				<p class="text-micro-data text-warm-gray-500 mt-0.5">{$_('ui.data_management')}</p>
			</div>
		</div>
		<div class="flex gap-2">
			{#if selectedFile && selectedFileType !== 'image'}
				<button class="btn-primary px-4" onclick={saveFile} disabled={saving}>
					{saving ? $_('save.saving') : $_('save.save_to_server')}
				</button>
			{/if}
		</div>
	</header>

	<div class="flex flex-1 min-h-0 flex-col overflow-hidden gap-2 p-2 md:flex-row md:gap-4 md:p-4">
		<!-- Left Pane: File Explorer -->
		<div class="h-[35dvh] min-h-60 w-full shrink-0 panel flex flex-col overflow-hidden shadow-panel md:h-auto md:min-h-0 md:w-1/3">
			<!-- Search Bar -->
			<div class="p-3 border-b border-black/15 bg-white">
				<div class="relative">
					<i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray-300"></i>
					<input 
						type="text" 
						class="input-studio w-full pl-9 py-2 rounded-sm bg-warm-gray-100 focus:bg-white"
						placeholder={$_('ui.search_crags') || "Search files and folders..."}
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button 
							class="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray-300 hover:text-near-black flex items-center justify-center"
							aria-label="Clear search"
							onclick={() => searchQuery = ''}
						>
							<i class="fa-solid fa-xmark"></i>
						</button>
					{/if}
				</div>
			</div>

			<!-- Breadcrumbs -->
			{#if !searchQuery}
			<div class="px-3 py-2 border-b border-black/15 bg-warm-gray-100 flex items-center gap-2 overflow-x-auto text-micro-data whitespace-nowrap">
				<button 
					class="text-warm-gray-500 hover:text-creator-blue transition-colors cursor-pointer flex items-center justify-center w-6 h-6 rounded-sm hover:bg-black/5"
					aria-label="Go to root"
					onclick={() => { const u = new URL(window.location.href); u.searchParams.delete('path'); goto(u.toString(), { keepFocus: true }); }}>
					<i class="fa-solid fa-house"></i>
				</button>
				{#each breadcrumbs as part, i}
					<span class="text-black/30">/</span>
					<button 
						class="text-warm-gray-500 hover:text-creator-blue transition-colors cursor-pointer px-1.5 py-1 rounded-sm hover:bg-black/5"
						onclick={() => { const u = new URL(window.location.href); u.searchParams.set('path', breadcrumbs.slice(0, i + 1).join('/')); goto(u.toString(), { keepFocus: true }); }}>
						{part}
					</button>
				{/each}
			</div>
			{/if}

			<!-- List -->
			<div class="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
				{#if searchQuery}
					<!-- Search Results -->
					{#if isSearching}
						<div class="p-6 text-center text-ui-label flex flex-col items-center justify-center h-full gap-3">
							<i class="fa-solid fa-spinner fa-spin text-xl text-warm-gray-300"></i>
							<span>{$_('ui.loading')}</span>
						</div>
					{:else if searchResults.length === 0}
						<div class="p-6 text-center text-body-text text-warm-gray-500 italic flex items-center justify-center h-full">
							{$_('ui.no_entries_found') || "No entries found."}
						</div>
					{:else}
						<ul class="space-y-1">
							<div class="px-3 py-1 mb-2 text-micro-data text-warm-gray-400 font-medium">Search Results</div>
							{#each searchResults as item}
								<li>
									<div 
										role="button"
										tabindex="0"
										class="w-full flex flex-col px-3 py-2 rounded-sm hover:bg-black/5 text-left group transition-colors cursor-pointer {selectedFile?.path === item.path ? 'bg-creator-blue/10 text-creator-blue' : ''}"
										onclick={() => openItem(item)}
										onkeydown={(e) => { if (e.key === 'Enter') openItem(item); }}
									>
										<div class="flex items-center gap-3">
											<i class="fa-solid {getFileIcon(item)} w-4 text-center"></i>
											<span class="font-medium {selectedFile?.path === item.path ? 'text-creator-blue' : 'text-near-black'}">{item.name}</span>
										</div>
										<span class="text-micro-data text-warm-gray-400 mt-1 truncate pl-7">
											{item.path}
										</span>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<!-- Standard Directory Listing -->
					{#if loadingItems}
						<div class="p-6 text-center text-ui-label flex flex-col items-center justify-center h-full gap-3">
							<i class="fa-solid fa-spinner fa-spin text-xl text-warm-gray-300"></i>
							<span>{$_('ui.loading')}</span>
						</div>
					{:else if items.length === 0}
						<div class="p-6 text-center text-body-text text-warm-gray-500 italic flex items-center justify-center h-full">
							Empty directory
						</div>
					{:else}
						<ul class="space-y-1">
							{#if currentPath}
								<li>
									<button 
										class="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-black/5 text-left text-body-text group transition-colors md:py-2"
										onclick={navigateUp}
									>
										<i class="fa-solid fa-level-up-alt text-warm-gray-300 w-4 text-center"></i>
										<span class="font-medium text-warm-gray-500">..</span>
									</button>
								</li>
							{/if}
							{#each [...items].sort((a, b) => {
								if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
								return a.name.localeCompare(b.name);
							}) as item}
								<li>
									<!-- svelte-ignore a11y_interactive_supports_focus -->
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<div 
										role="button"
										class="w-full flex items-center justify-between px-3 py-2.5 rounded-sm hover:bg-black/5 text-left text-body-text group transition-colors cursor-pointer md:py-2 {selectedFile?.path === item.path ? 'bg-creator-blue/10 text-creator-blue' : ''}"
										onclick={() => openItem(item)}
									>
										<div class="flex items-center gap-3 truncate">
											<i class="fa-solid {getFileIcon(item)} w-4 text-center"></i>
											<span class="truncate font-medium {selectedFile?.path === item.path ? 'text-creator-blue' : 'text-near-black'}">{item.name}</span>
										</div>
										<div class="flex items-center gap-1">
											<button 
												class="text-warm-gray-300 hover:text-creator-blue hover:bg-creator-blue/10 w-10 h-10 rounded flex items-center justify-center transition-colors md:w-6 md:h-6"
												onclick={(e) => renameItem(item, e)}
												title="Rename"
											>
												<i class="fa-solid fa-pen text-[11px]"></i>
											</button>
											<button 
												class="text-warm-gray-300 hover:text-rose-600 hover:bg-rose-50 w-10 h-10 rounded flex items-center justify-center transition-colors md:w-6 md:h-6"
												onclick={(e) => deleteItem(item, e)}
												title={$_('ui.delete')}
											>
												<i class="fa-solid fa-trash-can text-[11px]"></i>
											</button>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Right Pane: Editor -->
		<div class="min-h-0 w-full flex-1 panel flex flex-col relative overflow-hidden shadow-panel md:w-2/3">
			{#if error}
				<div class="absolute top-4 left-4 right-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-sm shadow-sm z-20 text-body-text flex justify-between items-center">
					<span class="font-medium">{error}</span>
					<button class="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-100" aria-label="Dismiss error" onclick={() => error = null}>
						<i class="fa-solid fa-xmark"></i>
					</button>
				</div>
			{/if}

			{#if selectedFile}
				<div class="flex items-center gap-2 p-3 border-b border-black/15 bg-white text-micro-data">
					<i class="fa-solid {selectedFileType === 'image' ? 'fa-image text-emerald-500' : (selectedFileType === 'json' ? 'fa-file-code text-creator-blue' : 'fa-file-lines text-warm-gray-400')}"></i>
					<span class="font-bold text-near-black">{selectedFile.name}</span>
					<span class="text-warm-gray-300 ml-2">{selectedFileType === 'image' ? 'Viewing' : 'Editing'}</span>
				</div>
				<div class="flex-1 bg-warm-white p-4 overflow-hidden relative">
					{#if selectedFileType === 'image'}
						<div class="absolute inset-4 bg-white panel-inner flex items-center justify-center p-4">
							<img 
								src={fileUrl(selectedFile.path)} 
								alt={selectedFile.name} 
								class="max-w-full max-h-full object-contain" 
							/>
						</div>
					{:else}
						<textarea
							class="absolute inset-4 bg-white panel-inner p-4 font-sans text-body-text leading-relaxed resize-none custom-scrollbar outline-none focus:ring-1 focus:ring-creator-blue focus:border-creator-blue transition-shadow"
							bind:value={fileContent}
							spellcheck="false"
						></textarea>
					{/if}
				</div>
			{:else}
				<div class="flex-1 flex flex-col items-center justify-center text-warm-gray-300 bg-white">
					<div class="w-16 h-16 rounded-full bg-warm-gray-100 flex items-center justify-center mb-4">
						<i class="fa-solid fa-file text-2xl opacity-50"></i>
					</div>
					<p class="text-section-title text-warm-gray-500">Select a file</p>
					<p class="text-body-text mt-2 text-center max-w-xs">Choose a file from the explorer to view or edit its contents.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

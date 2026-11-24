<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { _ } from 'svelte-i18n';
	import {
		listDir,
		readFile,
		writeFile,
		deleteFile,
		fileUrl,
		renameFile
	} from '$lib/api/felslager.ts';
	import { authState } from '$lib/api/auth.svelte.ts';
	import SessionInfo from '$lib/components/ui/SessionInfo.svelte';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import type { ApiListEntry } from '$lib/types/api.ts';

	const errorMessage = (value: unknown) => (value instanceof Error ? value.message : String(value));

	let currentPath = $derived($page.url.searchParams.get('path') || '');
	let items = $state<ApiListEntry[]>([]);
	let loadingItems = $state(false);

	let selectedFile = $state<ApiListEntry | null>(null);
	let selectedFileType = $state<'image' | 'json' | 'text' | null>(null);
	let fileContent = $state('');
	let savedFileContent = $state('');
	let saveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
	let saving = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let uploadInput = $state<HTMLInputElement | null>(null);

	let searchQuery = $state('');
	let searchResults = $state<ApiListEntry[]>([]);
	let isSearching = $state(false);
	let allFilesCache: ApiListEntry[] | null = null;

	type ModalState =
		| { kind: 'replace'; file: File }
		| { kind: 'rename'; item: ApiListEntry }
		| { kind: 'delete'; item: ApiListEntry };
	let modalState = $state<ModalState | null>(null);
	let modalInputValue = $state('');

	let isDirty = $derived(
		Boolean(selectedFile && selectedFileType !== 'image' && fileContent !== savedFileContent)
	);

	$effect(() => {
		if (searchQuery.trim().length > 0) {
			const handler = setTimeout(async () => {
				isSearching = true;
				try {
					if (!allFilesCache) {
						allFilesCache = await listDir('', { recursive: true });
					}
					const lowerQuery = searchQuery.toLowerCase();
					searchResults = allFilesCache.filter(
						(item) =>
							item.path.toLowerCase().includes(lowerQuery) ||
							item.name.toLowerCase().includes(lowerQuery)
					);
				} catch (e) {
					error = errorMessage(e);
				} finally {
					isSearching = false;
				}
			}, 300);
			return () => clearTimeout(handler);
		} else {
			searchResults = [];
		}
	});

	async function loadDirectory(path: string) {
		loadingItems = true;
		error = null;
		try {
			const rawItems = await listDir(path);
			const cleanPath = path.replace(/\/+$/, '');
			items = rawItems.map((item) => ({
				...item,
				path: cleanPath ? `${cleanPath}/${item.name}` : item.name
			}));
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loadingItems = false;
		}
	}

	$effect(() => {
		// Only run when currentPath changes
		loadDirectory(currentPath);
	});

	async function openItem(item: ApiListEntry) {
		if (item.type === 'dir') {
			searchQuery = '';
			selectedFile = null;
			selectedFileType = null;
			fileContent = '';
			savedFileContent = '';
			saveStatus = 'idle';
			const url = new URL(window.location.href);
			url.searchParams.set('path', item.path);
			goto(url.toString(), { keepFocus: true });
		} else {
			const lowerName = item.name.toLowerCase();
			const isJson = lowerName.endsWith('.json');
			const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].some((ext) =>
				lowerName.endsWith(ext)
			);
			const isBinary = ['.zip', '.pdf', '.mp4', '.mp3', '.wav', '.exe', '.bin'].some((ext) =>
				lowerName.endsWith(ext)
			);

			if (isImage) {
				selectedFile = item;
				selectedFileType = 'image';
				fileContent = '';
				savedFileContent = '';
				saveStatus = 'idle';
				error = null;
			} else if (!isBinary) {
				try {
					const res = await readFile(item.path);
					const text = await res.text();
					fileContent = text;
					savedFileContent = text;
					selectedFile = item;
					selectedFileType = isJson ? 'json' : 'text';
					saveStatus = 'idle';
					error = null;
				} catch (e) {
					error = errorMessage(e);
				}
			} else {
				error = $_('editor.unsupported_file', { values: { name: item.name } });
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
		savedFileContent = '';
		saveStatus = 'idle';

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
		if (!selectedFile) return;
		saving = true;
		saveStatus = 'saving';
		error = null;
		try {
			if (selectedFileType === 'json') {
				// Validate JSON before saving
				JSON.parse(fileContent);
				await writeFile(selectedFile.path, fileContent, 'application/json');
			} else {
				await writeFile(selectedFile.path, fileContent, 'text/plain');
			}
			savedFileContent = fileContent;
			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (e) {
			error = errorMessage(e);
			saveStatus = 'error';
		} finally {
			saving = false;
		}
	}

	function selectFileForUpload() {
		uploadInput?.click();
	}

	function handleUploadSelection(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;

		const path = currentPath ? `${currentPath}/${file.name}` : file.name;
		if (items.some((item) => item.path === path)) {
			modalState = { kind: 'replace', file };
			return;
		}

		if (!authState.requireAuth(() => uploadFile(file))) return;
		void uploadFile(file);
	}

	async function uploadFile(file: File) {
		const path = currentPath ? `${currentPath}/${file.name}` : file.name;

		uploading = true;
		error = null;
		try {
			await writeFile(path, file);
			allFilesCache = null;
			await loadDirectory(currentPath);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			uploading = false;
		}
	}

	function renameItem(item: ApiListEntry, e: MouseEvent) {
		e.stopPropagation();
		modalInputValue = item.name;
		modalState = { kind: 'rename', item };
	}

	async function renameItemAction(item: ApiListEntry, newPath: string) {
		try {
			await renameFile(item.path, newPath);
			if (selectedFile?.path === item.path) {
				selectedFile.path = newPath;
				selectedFile.name = newPath.split('/').pop() || newPath;
			}
			allFilesCache = null;
			await loadDirectory(currentPath);
		} catch (err) {
			error = errorMessage(err);
		}
	}

	function deleteItem(item: ApiListEntry, e: MouseEvent) {
		e.stopPropagation();
		modalState = { kind: 'delete', item };
	}

	async function deleteItemAction(item: ApiListEntry) {
		try {
			await deleteFile(item.path);
			if (selectedFile?.path === item.path) {
				selectedFile = null;
				selectedFileType = null;
				fileContent = '';
				savedFileContent = '';
				saveStatus = 'idle';
			}
			allFilesCache = null;
			await loadDirectory(currentPath);
		} catch (err) {
			error = errorMessage(err);
		}
	}

	async function handleModalConfirm(value: string) {
		const current = modalState;
		modalState = null;
		if (!current) return;

		if (current.kind === 'replace') {
			if (!authState.requireAuth(() => uploadFile(current.file))) return;
			await uploadFile(current.file);
		} else if (current.kind === 'rename') {
			const newName = value.trim();
			if (!newName || newName === current.item.name) return;
			const parts = current.item.path.split('/');
			parts.pop();
			const basePath = parts.join('/');
			const newPath = basePath ? `${basePath}/${newName}` : newName;
			if (!authState.requireAuth(() => renameItemAction(current.item, newPath))) return;
			await renameItemAction(current.item, newPath);
		} else if (current.kind === 'delete') {
			if (!authState.requireAuth(() => deleteItemAction(current.item))) return;
			await deleteItemAction(current.item);
		}
	}

	function getFileIcon(item: ApiListEntry) {
		if (item.type === 'dir') return 'fa-folder text-amber-500';
		const name = item.name.toLowerCase();
		if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico'].some((e) => name.endsWith(e)))
			return 'fa-image text-emerald-500';
		if (name.endsWith('.json')) return 'fa-file-code text-creator-blue';
		if (['.txt', '.md', '.csv'].some((e) => name.endsWith(e)))
			return 'fa-file-lines text-warm-gray-400';
		return 'fa-file text-warm-gray-400';
	}

	let breadcrumbs = $derived(currentPath ? currentPath.split('/').filter(Boolean) : []);
</script>

<div
	class="creator-studio flex h-full w-full flex-col bg-warm-white text-body-text text-near-black"
>
	<!-- Header -->
	<header
		class="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-3 py-2.5 shadow-xs md:px-4"
	>
		<div class="flex min-w-0 items-center gap-2 md:gap-3">
			<button
				type="button"
				class="tool-btn shrink-0"
				onclick={() => (currentPath ? navigateUp() : goto(`${base}/`))}
				title={currentPath ? $_('editor.go_up') : $_('ui.back_to_launcher')}
				aria-label={currentPath ? $_('editor.go_up') : $_('ui.back_to_launcher')}
			>
				<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
			</button>
			<div class="min-w-0">
				<h1 class="text-section-title truncate leading-tight">{$_('ui.felslager_studio')}</h1>
				<p class="text-micro-data mt-0.5 truncate text-warm-gray-500">
					{$_('ui.data_management')}
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2">
			<a
				class="btn-secondary gap-1.5 px-3 py-1.5 text-xs"
				href={`${base}/felslager/reviews`}
				><i class="fa-solid fa-inbox text-warm-gray-500" aria-hidden="true"></i>{$_(
					'editor.review_inbox'
				)}</a
			>
			<input bind:this={uploadInput} type="file" class="hidden" onchange={handleUploadSelection} />
			<button
				type="button"
				class="btn-secondary gap-1.5 px-3 py-1.5 text-xs"
				onclick={selectFileForUpload}
				disabled={uploading}
			>
				<i class="fa-solid fa-upload text-warm-gray-500" aria-hidden="true"></i>
				{uploading ? $_('editor.uploading') : $_('editor.add_file')}
			</button>
			{#if selectedFile && selectedFileType !== 'image'}
				<SessionInfo />
				<SaveStatus status={saveStatus} errorMessage={error || ''} />
				<button
					type="button"
					class="btn-primary px-3.5 py-1.5 text-xs"
					onclick={saveFile}
					disabled={saving}
				>
					{saving ? $_('save.saving') : $_('save.save_to_server')}
				</button>
			{/if}
			<LanguageSwitcher compact />
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 md:flex-row md:gap-4 md:p-4">
		<!-- Left Pane: File Explorer -->
		<div
			class="panel flex h-[35dvh] min-h-56 w-full shrink-0 flex-col overflow-hidden md:h-auto md:min-h-0 md:w-1/3"
		>
			<!-- Search Bar -->
			<div class="border-b border-black/10 bg-white p-3">
				<div class="relative">
					<i
						class="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-warm-gray-400"
						aria-hidden="true"
					></i>
					<input
						type="text"
						class="input-studio w-full pr-8 pl-9"
						placeholder={$_('editor.search_files_and_folders')}
						aria-label={$_('editor.search_files_and_folders')}
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							type="button"
							class="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-near-black"
							aria-label={$_('editor.clear_search')}
							onclick={() => (searchQuery = '')}
						>
							<i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
						</button>
					{/if}
				</div>
			</div>

			<!-- Breadcrumbs -->
			{#if !searchQuery}
				<div
					class="flex items-center gap-1.5 overflow-x-auto border-b border-black/10 bg-warm-white/70 px-3 py-1.5 text-micro-data whitespace-nowrap"
				>
					<button
						type="button"
						class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-warm-gray-500 transition-colors hover:bg-black/5 hover:text-creator-blue"
						aria-label={$_('editor.go_to_root')}
						onclick={() => {
							const u = new URL(window.location.href);
							u.searchParams.delete('path');
							goto(u.toString(), { keepFocus: true });
						}}
					>
						<i class="fa-solid fa-house" aria-hidden="true"></i>
					</button>
					{#each breadcrumbs as part, i}
						<span class="text-warm-gray-300">/</span>
						<button
							type="button"
							class="cursor-pointer rounded-sm px-1.5 py-0.5 text-warm-gray-600 transition-colors hover:bg-black/5 hover:text-creator-blue"
							onclick={() => {
								const u = new URL(window.location.href);
								u.searchParams.set('path', breadcrumbs.slice(0, i + 1).join('/'));
								goto(u.toString(), { keepFocus: true });
							}}
						>
							{part}
						</button>
					{/each}
				</div>
			{/if}

			<!-- List -->
			<div class="custom-scrollbar flex-1 overflow-y-auto bg-white p-2">
				{#if searchQuery}
					<!-- Search Results -->
					{#if isSearching}
						<div
							class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-ui-label"
						>
							<i class="fa-solid fa-spinner fa-spin text-xl text-warm-gray-300" aria-hidden="true"
							></i>
							<span>{$_('ui.loading')}</span>
						</div>
					{:else if searchResults.length === 0}
						<div
							class="flex h-full items-center justify-center p-6 text-center text-body-text text-warm-gray-500 italic"
						>
							{$_('ui.no_entries_found') || $_('editor.no_entries_found')}
						</div>
					{:else}
						<ul class="m-0! list-none! space-y-1 p-0!">
							<li class="mb-2 px-3 py-1 text-micro-data font-medium text-warm-gray-400">
								{$_('editor.search_results')}
							</li>
							{#each searchResults as item}
								<li>
									<div
										role="button"
										tabindex="0"
										class="group flex w-full cursor-pointer flex-col rounded-sm px-3 py-2 text-left transition-colors hover:bg-black/5 {selectedFile?.path ===
										item.path
											? 'bg-creator-blue/10 text-creator-blue'
											: ''}"
										onclick={() => openItem(item)}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												void openItem(item);
											}
										}}
									>
										<div class="flex items-center gap-3">
											<i class="fa-solid {getFileIcon(item)} w-4 text-center" aria-hidden="true"
											></i>
											<span
												class="font-medium {selectedFile?.path === item.path
													? 'text-creator-blue'
													: 'text-near-black'}">{item.name}</span
											>
										</div>
										<span class="mt-0.5 truncate pl-7 text-micro-data text-warm-gray-400">
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
						<div
							class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-ui-label"
						>
							<i class="fa-solid fa-spinner fa-spin text-xl text-warm-gray-300" aria-hidden="true"
							></i>
							<span>{$_('ui.loading')}</span>
						</div>
					{:else if items.length === 0}
						<div
							class="flex h-full items-center justify-center p-6 text-center text-body-text text-warm-gray-500 italic"
						>
							{$_('editor.empty_directory')}
						</div>
					{:else}
						<ul class="m-0! list-none! space-y-0.5 p-0!">
							{#if currentPath}
								<li>
									<button
										type="button"
										class="group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-body-text transition-colors hover:bg-black/5 md:py-2"
										onclick={navigateUp}
									>
										<i
											class="fa-solid fa-level-up-alt w-4 text-center text-warm-gray-400"
											aria-hidden="true"
										></i>
										<span class="font-medium text-warm-gray-500">..</span>
									</button>
								</li>
							{/if}
							{#each [...items].sort((a, b) => {
								if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
								return a.name.localeCompare(b.name);
							}) as item}
								<li>
									<div
										role="button"
										tabindex="0"
										class="group flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-left text-body-text transition-colors hover:bg-black/5 {selectedFile?.path ===
										item.path
											? 'bg-creator-blue/10 text-creator-blue'
											: ''}"
										onclick={() => openItem(item)}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												void openItem(item);
											}
										}}
									>
										<div class="flex min-w-0 items-center gap-3">
											<i
												class="fa-solid {getFileIcon(item)} w-4 shrink-0 text-center"
												aria-hidden="true"
											></i>
											<span
												class="truncate font-medium {selectedFile?.path === item.path
													? 'text-creator-blue'
													: 'text-near-black'}">{item.name}</span
											>
										</div>
										<div class="flex shrink-0 items-center gap-1">
											<button
												type="button"
												class="flex h-8 w-8 items-center justify-center rounded-sm text-warm-gray-400 transition-colors hover:bg-creator-blue/10 hover:text-creator-blue md:h-7 md:w-7"
												onclick={(e) => renameItem(item, e)}
												title={$_('editor.rename')}
												aria-label={$_('editor.rename')}
											>
												<i class="fa-solid fa-pen text-[11px]" aria-hidden="true"></i>
											</button>
											<button
												type="button"
												class="flex h-8 w-8 items-center justify-center rounded-sm text-warm-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 md:h-7 md:w-7"
												onclick={(e) => deleteItem(item, e)}
												title={$_('ui.delete')}
												aria-label={$_('ui.delete')}
											>
												<i class="fa-solid fa-trash-can text-[11px]" aria-hidden="true"></i>
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
		<div class="panel relative flex min-h-0 w-full flex-1 flex-col overflow-hidden md:w-2/3">
			{#if error}
				<div
					role="alert"
					class="absolute top-3 right-3 left-3 z-20 flex items-center justify-between gap-2 rounded-sm border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-body-text text-rose-700 shadow-xs"
				>
					<span class="font-medium">{error}</span>
					<button
						type="button"
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-rose-100"
						aria-label={$_('editor.dismiss_error')}
						onclick={() => (error = null)}
					>
						<i class="fa-solid fa-xmark" aria-hidden="true"></i>
					</button>
				</div>
			{/if}

			{#if selectedFile}
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-4 py-2.5 text-micro-data"
				>
					<div class="flex min-w-0 items-center gap-2">
						<i
							class="fa-solid {selectedFileType === 'image'
								? 'fa-image text-emerald-500'
								: selectedFileType === 'json'
									? 'fa-file-code text-creator-blue'
									: 'fa-file-lines text-warm-gray-400'}"
							aria-hidden="true"
						></i>
						<span class="truncate font-semibold text-near-black">{selectedFile.name}</span>
						<span class="text-warm-gray-400">
							{selectedFileType === 'image' ? $_('editor.viewing') : $_('editor.editing')}
						</span>
					</div>
					{#if isDirty}
						<span
							class="inline-flex items-center gap-1.5 rounded-sm bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"
						>
							<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
							{$_('editor.unsaved_changes')}
						</span>
					{/if}
				</div>
				<div class="relative flex-1 overflow-hidden bg-warm-white p-3 md:p-4">
					{#if selectedFileType === 'image'}
						<div
							class="panel-inner absolute inset-3 flex items-center justify-center bg-white p-4 md:inset-4"
						>
							<img
								src={fileUrl(selectedFile.path)}
								alt={selectedFile.name}
								class="max-h-full max-w-full object-contain"
							/>
						</div>
					{:else}
						<textarea
							class="panel-inner custom-scrollbar absolute inset-3 resize-none bg-white p-4 font-mono text-[13px] leading-relaxed text-near-black outline-none focus:border-creator-blue focus:ring-2 focus:ring-creator-blue/20 md:inset-4"
							bind:value={fileContent}
							spellcheck="false"
						></textarea>
					{/if}
				</div>
			{:else}
				<div class="flex flex-1 flex-col items-center justify-center bg-white p-6 text-center">
					<div
						class="mb-4 flex h-14 w-14 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-warm-gray-400"
					>
						<i class="fa-solid fa-file-lines text-xl" aria-hidden="true"></i>
					</div>
					<p class="text-section-title text-near-black">{$_('editor.select_a_file')}</p>
					<p class="text-body-text mt-1.5 max-w-xs text-warm-gray-500">
						{$_('editor.choose_a_file_from_the_explorer_to_view_or_edit_its_contents')}
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<ConfirmModal
	open={Boolean(modalState)}
	title={modalState?.kind === 'rename'
		? $_('editor.rename')
		: modalState?.kind === 'delete'
			? $_('ui.delete')
			: $_('editor.add_file')}
	message={modalState?.kind === 'replace'
		? $_('editor.replace_file', { values: { name: modalState.file.name } })
		: modalState?.kind === 'delete'
			? $_('editor.delete_file', { values: { name: modalState.item.name } })
			: modalState?.kind === 'rename'
				? $_('editor.rename_file', { values: { name: modalState.item.name } })
				: ''}
	inputLabel={modalState?.kind === 'rename' ? $_('editor.name') : ''}
	bind:inputValue={modalInputValue}
	confirmLabel={modalState?.kind === 'delete'
		? $_('ui.delete')
		: modalState?.kind === 'rename'
			? $_('editor.rename')
			: $_('editor.confirm')}
	destructive={modalState?.kind === 'delete'}
	onConfirm={handleModalConfirm}
	onCancel={() => (modalState = null)}
/>

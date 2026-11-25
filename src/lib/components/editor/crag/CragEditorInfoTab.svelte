<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import {
		availableTags,
		commonEquipment,
		cragTypes,
		securityOptions
	} from './crag-editor-options.ts';
	import { rockTypes } from '$lib/config.ts';

	const cragEditorState = getCragEditorSession();
	const { actions } = getCragEditorTools();
	const {
		addEquipmentItem: onAddEquipmentItem,
		removeEquipmentItem: onRemoveEquipmentItem,
		addCragImages: onAddCragImages,
		removeCragImage: onRemoveCragImage,
		setActiveMetadataId,
		selectMetadataTarget
	} = actions;
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { fileUrl } from '$lib/api/felslager.ts';
	import CragHierarchyPlacement from './CragHierarchyPlacement.svelte';
	import { slugifyName } from './crag-editor-paths.ts';
	const HIERARCHY_KINDS = ['country', 'region', 'area', 'crag', 'sector'];
	import { getHierarchySourceRefs } from '$lib/assets/js/load-crag-editor-entry.ts';
	import type { FelsEntryWorkspace } from '$lib/types/crag';
	import type { MetadataValue } from '$lib/types/crag';

	type SaveStatus = 'idle' | 'saving' | 'success' | 'error';
	type Breadcrumb = {
		key: string;
		source: ReturnType<typeof getHierarchySourceRefs>[number];
		entry: FelsEntryWorkspace | null;
	};
	type ImageStatus = { icon: string; label: string; classes: string };
	type CragImage = { path?: string };
	type EquipmentItem = { name: string; amount: number };

	let { saveStatus = 'idle' }: { saveStatus?: SaveStatus } = $props();
	let activeEntry = $derived(
		cragEditorState.getWorkspaceEntry(cragEditorState.activeMetadataTarget)
	);
	let metadata = $derived(
		cragEditorState.getMetadataTarget() ||
			cragEditorState.getActiveEntry()?.properties ||
			({} as MetadataValue)
	);
	let isCurrentEntry = $derived(activeEntry === cragEditorState.getActiveWorkspaceEntry());
	let hierarchyError = $derived(
		cragEditorState.identityError ||
			cragEditorState.hierarchyErrors.find(
				(error) => error.key === cragEditorState.activeMetadataTarget
			) ||
			null
	);
	let breadcrumbs = $derived.by(() => {
		const entryPath =
			cragEditorState.activeMetadataTarget || cragEditorState.activeWorkspaceEntryPath || '';
		return getHierarchySourceRefs(entryPath).map((source) => {
			const key = [source.path, source.id].filter(Boolean).join('/');
			return { key, source, entry: cragEditorState.getWorkspaceEntry(key) };
		});
	});
	let pendingCragImages = $derived(activeEntry?.pendingImages || []);
	let pendingCragImageCount = $derived(pendingCragImages.filter(Boolean).length);
	let equipment = $derived((metadata.equipment || []) as EquipmentItem[]);

	function handleNameInput(value: string) {
		cragEditorState.setMetadataField('name', value);
		if (!activeEntry || activeEntry.sourcePath || !isCurrentEntry) return;
		const baseSlug = slugifyName(value);
		if (!baseSlug) return;
		const parent = activeEntry.path ? cragEditorState.getWorkspaceEntry(activeEntry.path) : null;
		const takenIds = new Set(
			(parent?.childEntries || [])
				.filter((child) => child !== activeEntry)
				.map((child) => String(child.entry?.properties.id || child.id || ''))
		);
		let nextId = baseSlug;
		let suffix = 2;
		while (takenIds.has(nextId)) nextId = `${baseSlug}-${suffix++}`;
		setActiveMetadataId(nextId);
	}

	function selectEntry(entry: FelsEntryWorkspace) {
		selectMetadataTarget(cragEditorState.getWorkspaceEntryPath(entry));
	}

	function selectBreadcrumb(breadcrumb: Breadcrumb) {
		const entry = breadcrumb.entry || cragEditorState.getWorkspaceEntry(breadcrumb.key);
		if (!entry) return;
		selectEntry(entry);
	}

	function handleCragImageInput(event: Event & { currentTarget: HTMLInputElement }) {
		onAddCragImages(Array.from(event.currentTarget.files || []));
		event.currentTarget.value = '';
	}

	function getImageSrc(image: CragImage): string {
		const src =
			pendingCragImages.find((pending) => pending?.path === image?.path)?.previewUrl || image?.path;
		if (!src) return '';
		return /^(blob:|data:|https?:\/\/)/i.test(src) ? src : fileUrl(src);
	}

	function getImageStatus(image: CragImage): ImageStatus {
		if (!pendingCragImages.some((pending) => pending?.path === image?.path))
			return {
				icon: 'fa-cloud-check',
				label: $_('editor.saved'),
				classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
			};
		if (saveStatus === 'saving')
			return {
				icon: 'fa-spinner fa-spin',
				label: $_('editor.uploading_label'),
				classes: 'bg-creator-blue/10 text-creator-blue border-creator-blue/20'
			};
		return {
			icon: 'fa-clock',
			label: $_('editor.ready_to_save'),
			classes: 'bg-amber-50 text-amber-700 border-amber-200'
		};
	}
</script>

{#snippet breadcrumbLinks()}
	<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
		{#each breadcrumbs as breadcrumb, i}
			{@const entryName =
				breadcrumb.entry?.entry?.properties.name ||
				breadcrumb.entry?.entry?.properties.id ||
				breadcrumb.source.id}
			{@const entryKind = $_(
				'editor.hierarchy_' + (breadcrumb.entry?.entry?.properties.kind || 'area')
			)}
			{#if i > 0}<i
					class="fa-solid fa-chevron-right text-[8px] text-warm-gray-300"
					aria-hidden="true"
				></i>{/if}
			<button
				type="button"
				onclick={() => selectBreadcrumb(breadcrumb)}
				title={`${entryName} (${entryKind})`}
				class="rounded-sm px-1 py-0.5 text-[10px] leading-tight transition-none {activeEntry ===
				breadcrumb.entry
					? 'bg-white font-bold text-creator-blue shadow-xs'
					: 'text-warm-gray-500 hover:bg-white hover:text-near-black'}"
			>
				{entryName}
			</button>
		{/each}
	</div>
{/snippet}

<div class="space-y-3">
	{#if isCurrentEntry}
		<CragHierarchyPlacement compact={true} breadcrumbs={breadcrumbLinks} />
	{:else}
		<nav
			class="flex items-center justify-between gap-1.5 rounded-sm border border-black/10 bg-black/[0.03] px-2 py-1.5"
			aria-label={$_('editor.metadata_hierarchy')}
		>
			{@render breadcrumbLinks()}
		</nav>
	{/if}
	<div class="space-y-3">
		<div class="space-y-0.5">
			<label for="metadata-name" class="text-ui-label block">{$_('editor.name')}</label>
			<input
				id="metadata-name"
				type="text"
				value={metadata.name}
				oninput={(event) => handleNameInput(event.currentTarget.value)}
				class="input-studio w-full"
				placeholder={$_('editor.example_name')}
			/>
		</div>
		<div class="space-y-0.5">
			<label for="metadata-kind" class="text-ui-label block">{$_('editor.kind')}</label>
			<select
				id="metadata-kind"
				value={metadata.kind}
				onchange={(event) => cragEditorState.setMetadataField('kind', event.currentTarget.value)}
				class="input-studio w-full appearance-none"
			>
				{#each HIERARCHY_KINDS as kind}<option value={kind}
						>{$_('editor.hierarchy_' + kind)}</option
					>{/each}
			</select>
		</div>
		{#if hierarchyError}<p
				class="rounded-sm border border-rose-200 bg-rose-50 p-2 text-micro-data font-bold text-rose-700"
			>
				{hierarchyError.message}
			</p>{/if}
		{#if !isCurrentEntry && activeEntry}
			<div
				class="rounded-sm border border-black/10 bg-black/[0.03] p-2 text-micro-data text-warm-gray-500"
			>
				{$_('editor.source')}
				<span class="font-mono">{cragEditorState.getWorkspaceEntryPath(activeEntry)}</span>
				{$_('editor.read_only')}
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			<div class="space-y-0.5">
				<label for="crag-security" class="text-ui-label block">{$_('editor.security')}</label>
				<select
					id="crag-security"
					value={metadata.security || ''}
					onchange={(event) =>
						cragEditorState.setMetadataField('security', event.currentTarget.value)}
					class="input-studio w-full appearance-none"
				>
					<option value="">{$_('editor.select')}</option>
					{#each securityOptions as opt}
						<option value={opt}>{$_('editor.security_' + opt)}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-0.5">
				<label for="crag-rock-type" class="text-ui-label block">{$_('editor.rock_type')}</label
				><select
					id="crag-rock-type"
					value={metadata.rock_type || ''}
					onchange={(event) =>
						cragEditorState.setMetadataField('rock_type', event.currentTarget.value)}
					class="input-studio w-full appearance-none"
				>
					<option value="">{$_('editor.select')}</option>
					{#each rockTypes as opt}
						<option value={opt}>{$_('rock_types.' + opt)}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="space-y-0.5">
			<p class="text-ui-label block">{$_('editor.crag_type')}</p>
			<TagSelector
				selectedTags={metadata.type || []}
				availableTags={cragTypes}
				onChange={(value) => cragEditorState.setMetadataField('type', value)}
			/>
		</div>
		<div class="space-y-0.5">
			<p class="text-ui-label block">{$_('editor.tags')}</p>
			<TagSelector
				selectedTags={metadata.tags || []}
				{availableTags}
				onChange={(value) => cragEditorState.setMetadataField('tags', value)}
			/>
		</div>
		<div class="space-y-1 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center">
				<p class="text-ui-label !m-0">{$_('editor.equipment')}</p>
				<button
					onclick={onAddEquipmentItem}
					class="text-ui-label text-creator-blue hover:text-creator-blue-active"
					>{$_('editor.add_add')}
				</button>
			</div>
			<div class="space-y-1">
				{#each equipment as item, i}
					<div
						class="flex gap-1 items-center bg-white p-1 rounded-sm border border-black/15 shadow-sm"
					>
						<select
							value={item.name}
							onchange={(event) =>
								cragEditorState.updateMetadataEquipmentItem(i, 'name', event.currentTarget.value)}
							class="flex-1 bg-transparent px-1 py-1 text-body-text outline-none border-none"
						>
							{#each commonEquipment as name}
								<option value={name}>{name}</option>
							{/each}
						</select><input
							type="number"
							value={item.amount}
							oninput={(event) =>
								cragEditorState.updateMetadataEquipmentItem(
									i,
									'amount',
									Number(event.currentTarget.value)
								)}
							class="w-10 bg-black/5 px-1 py-1 rounded-sm text-body-text outline-none text-center"
						/>
						<button
							onclick={() => onRemoveEquipmentItem(i)}
							aria-label={$_('editor.remove_equipment_item')}
							class="text-warm-gray-300 hover:text-rose-600 px-1.5"
							><i class="fa-solid fa-trash-can text-[10px]"></i></button
						>
					</div>
				{/each}
			</div>
		</div>
		<div class="space-y-2 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center">
				<div>
					<p class="text-ui-label !m-0">{$_('editor.pictures')}</p>
					{#if pendingCragImageCount > 0}<p class="text-micro-data text-amber-700 !m-0">
							{$_('editor.images_pending', { values: { count: pendingCragImageCount } })}
						</p>{/if}
				</div>
				<label class="text-ui-label text-creator-blue hover:text-creator-blue-active cursor-pointer"
					>{$_('editor.add_add')}<input
						type="file"
						accept="image/*"
						multiple
						class="hidden"
						onchange={handleCragImageInput}
					/></label
				>
			</div>
			{#if (activeEntry?.images || []).length === 0}<p class="text-micro-data text-warm-gray-400">
					{$_('editor.no_pictures_added')}
				</p>{:else}
				<div class="grid grid-cols-2 gap-2">
					{#each activeEntry?.images || [] as image, i}{@const imageStatus = getImageStatus(image)}
						<div class="relative rounded-sm border border-black/15 bg-white p-1 shadow-sm">
							{#if getImageSrc(image)}<img
									src={getImageSrc(image)}
									alt={image.name || $_('editor.crag_picture')}
									class="h-20 w-full rounded-sm object-cover"
								/>{/if}
							<div
								class="absolute left-2 top-2 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight shadow-sm {imageStatus.classes}"
							>
								<i class="fa-solid {imageStatus.icon} mr-1"></i>{imageStatus.label}
							</div>
							<p class="mt-1 truncate text-micro-data text-warm-gray-500">
								{image.name || image.path}
							</p>
							<button
								type="button"
								onclick={() => onRemoveCragImage(i)}
								class="absolute right-1 top-1 h-5 w-5 rounded-sm bg-white/90 text-warm-gray-400 hover:text-rose-600"
								title={$_('editor.remove_picture')}
								><i class="fa-solid fa-xmark text-[10px]"></i></button
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<div class="space-y-0.5 pt-2 border-t border-black/15">
			<label for="crag-description-de" class="text-ui-label block"
				>{$_('editor.description_de')}</label
			><textarea
				id="crag-description-de"
				rows="2"
				oninput={(event) =>
					cragEditorState.setMetadataField('description_de', event.currentTarget.value)}
				value={metadata.description_de || ''}
				class="input-studio w-full resize-none"
			></textarea>
		</div>
		<div class="space-y-0.5">
			<label for="crag-description-en" class="text-ui-label block"
				>{$_('editor.description_en')}</label
			><textarea
				id="crag-description-en"
				value={metadata.description_en || ''}
				oninput={(event) =>
					cragEditorState.setMetadataField('description_en', event.currentTarget.value)}
				rows="2"
				class="input-studio w-full resize-none"
			></textarea>
		</div>
	</div>
</div>

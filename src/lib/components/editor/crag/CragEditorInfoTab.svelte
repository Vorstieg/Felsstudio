<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	import { availableTags, commonEquipment, cragTypes, securityOptions } from './crag-editor-options.js';
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
	const HIERARCHY_KINDS = ['country', 'region', 'area', 'crag', 'sector'];
	import { getHierarchySourceRefs } from '$lib/assets/js/load-crag-editor-entry.ts';

	let {
		saveStatus = 'idle'
	} = $props();
	let activeEntry = $derived(cragEditorState.getWorkspaceEntry(cragEditorState.activeMetadataTarget));
	let metadata = $derived(cragEditorState.getMetadataTarget() || cragEditorState.getActiveEntry()?.properties || {});
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
		return getHierarchySourceRefs(entryPath)
			.map((source) => {
				const key = [source.path, source.id].filter(Boolean).join('/');
				return { key, source, entry: cragEditorState.getWorkspaceEntry(key) };
			});
	});
	let pendingCragImages = $derived(activeEntry?.pendingImages || []);
	let pendingCragImageCount = $derived(pendingCragImages.filter(Boolean).length);

	function selectEntry(entry) {
		selectMetadataTarget(cragEditorState.getWorkspaceEntryPath(entry));
	}

	function selectBreadcrumb(breadcrumb) {
		const entry =
			breadcrumb.entry || cragEditorState.getWorkspaceEntry(breadcrumb.key);
		if (!entry) return;
		selectEntry(entry);
	}

	function handleCragImageInput(event) {
		onAddCragImages(Array.from(event.currentTarget.files || []));
		event.currentTarget.value = '';
	}

	function getImageSrc(image) {
		const src = pendingCragImages.find((pending) => pending?.path === image?.path)?.previewUrl || image?.path;
		if (!src) return '';
		return /^(blob:|data:|https?:\/\/)/i.test(src) ? src : fileUrl(src);
	}

	function getImageStatus(image) {
		if (!pendingCragImages.some((pending) => pending?.path === image?.path)) return {
			icon: 'fa-cloud-check',
			label: 'Saved',
			classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
		};
		if (saveStatus === 'saving') return {
			icon: 'fa-spinner fa-spin',
			label: 'Uploading',
			classes: 'bg-creator-blue/10 text-creator-blue border-creator-blue/20'
		};
		return { icon: 'fa-clock', label: 'Ready to save', classes: 'bg-amber-50 text-amber-700 border-amber-200' };
	}
</script>

<div class="space-y-4">
	<nav class="flex flex-wrap items-center gap-1 rounded-sm border border-black/10 bg-black/[0.03] p-2" aria-label="Metadata hierarchy">
		{#each breadcrumbs as breadcrumb, i}
			{#if i > 0}<i class="fa-solid fa-chevron-right text-[9px] text-warm-gray-300"></i>{/if}
			<button type="button" onclick={() => selectBreadcrumb(breadcrumb)}
				class="rounded-sm px-1.5 py-1 text-micro-data {activeEntry === breadcrumb.entry ? 'bg-white font-bold text-creator-blue shadow-sm' : 'text-warm-gray-500 hover:bg-white'}">
				{breadcrumb.entry?.entry?.properties.name || breadcrumb.entry?.entry?.properties.id || breadcrumb.source.id} <span class="opacity-60">({breadcrumb.entry?.entry?.properties.kind || 'area'})</span>
			</button>
		{/each}
		{#if isCurrentEntry}
			<CragHierarchyPlacement compact />
		{/if}
	</nav>
	<div class="space-y-3">
		<div class="space-y-0.5">
			<label for="metadata-name" class="text-ui-label block">Name</label>
			<input id="metadata-name"
			       type="text"
			       value={metadata.name}
			       oninput={(event) => cragEditorState.setMetadataField('name', event.currentTarget.value)}
			       class="input-studio w-full"
			       placeholder="e.g. Efeugrat" />
		</div>
		<div class="grid grid-cols-2 gap-2">
			<div class="space-y-0.5"><label for="metadata-kind" class="text-ui-label block">Kind</label>
				<select id="metadata-kind" value={metadata.kind} onchange={(event) => cragEditorState.setMetadataField('kind', event.currentTarget.value)} class="input-studio w-full appearance-none">
					{#each HIERARCHY_KINDS as kind}<option value={kind}>{kind}</option>{/each}
				</select>
			</div>
			<div class="space-y-0.5"><label for="metadata-id" class="text-ui-label block">ID</label>
				<input id="metadata-id" value={metadata.id} readonly={!isCurrentEntry}
					onchange={(event) => {
						setActiveMetadataId(event.currentTarget.value);
						event.currentTarget.value = cragEditorState.getMetadataTarget()?.id || '';
					}}
					class="input-studio w-full font-mono read-only:bg-black/5 read-only:text-warm-gray-400" />
			</div>
		</div>
		{#if hierarchyError}<p class="rounded-sm border border-rose-200 bg-rose-50 p-2 text-micro-data font-bold text-rose-700">{hierarchyError.message}</p>{/if}
		{#if !isCurrentEntry && activeEntry}
			<div class="rounded-sm border border-black/10 bg-black/[0.03] p-2 text-micro-data text-warm-gray-500">Source: <span class="font-mono">{cragEditorState.getWorkspaceEntryPath(activeEntry)}</span> (read-only)</div>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			<div class="space-y-0.5">
				<label for="crag-security" class="text-ui-label block">Security</label>
				<select
					id="crag-security"
					value={metadata.security || ''}
					onchange={(event) => cragEditorState.setMetadataField('security', event.currentTarget.value)}
					class="input-studio w-full appearance-none">
					<option value="">Select...</option>
					{#each securityOptions as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-0.5"><label for="crag-rock-type" class="text-ui-label block">Rock Type</label><select
				id="crag-rock-type"
				value={metadata.rock_type || ''}
				onchange={(event) => cragEditorState.setMetadataField('rock_type', event.currentTarget.value)}
				class="input-studio w-full appearance-none">
				<option value="">Select...</option>
				{#each rockTypes as opt}
					<option value={opt}>{opt}</option>
				{/each}
			</select></div>
		</div>
		<div class="space-y-0.5"><p class="text-ui-label block">Crag Type</p>
			<TagSelector selectedTags={metadata.type || []} availableTags={cragTypes}
			             onChange={(value) => cragEditorState.setMetadataField('type', value)} />
		</div>
		<div class="space-y-0.5"><p class="text-ui-label block">Tags</p>
			<TagSelector selectedTags={metadata.tags || []} availableTags={availableTags}
			             onChange={(value) => cragEditorState.setMetadataField('tags', value)} />
		</div>
		<div class="space-y-1 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center"><p class="text-ui-label !m-0">Equipment</p>
				<button onclick={onAddEquipmentItem} class="text-ui-label text-creator-blue hover:text-creator-blue-active">+
					Add
				</button>
			</div>
			<div class="space-y-1">
				{#each metadata.equipment || [] as item, i}
					<div class="flex gap-1 items-center bg-white p-1 rounded-sm border border-black/15 shadow-sm"><select
						value={item.name}
						onchange={(event) => cragEditorState.updateMetadataEquipmentItem(i, 'name', event.currentTarget.value)}
						class="flex-1 bg-transparent px-1 py-1 text-body-text outline-none border-none">
						{#each commonEquipment as name}
							<option value={name}>{name}</option>
						{/each}
					</select><input type="number"
					                value={item.amount}
					                oninput={(event) => cragEditorState.updateMetadataEquipmentItem(i, 'amount', Number(event.currentTarget.value))}
					                class="w-10 bg-black/5 px-1 py-1 rounded-sm text-body-text outline-none text-center" />
						<button onclick={() => onRemoveEquipmentItem(i)} aria-label="Remove equipment item"
						        class="text-warm-gray-300 hover:text-rose-600 px-1.5"><i
							class="fa-solid fa-trash-can text-[10px]"></i></button>
					</div>
				{/each}
			</div>
		</div>
		<div class="space-y-2 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center">
				<div><p class="text-ui-label !m-0">Pictures</p>
					{#if pendingCragImageCount > 0}<p class="text-micro-data text-amber-700 !m-0">{pendingCragImageCount}
						picture{pendingCragImageCount === 1 ? '' : 's'} ready to upload. Press Save before leaving or reloading; draft storage cannot keep image files.</p>{/if}
				</div>
				<label class="text-ui-label text-creator-blue hover:text-creator-blue-active cursor-pointer">+ Add<input
					type="file" accept="image/*" multiple class="hidden" onchange={handleCragImageInput} /></label></div>
			{#if (activeEntry?.images || []).length === 0}<p class="text-micro-data text-warm-gray-400">No
				pictures added.</p>{:else}
				<div class="grid grid-cols-2 gap-2">
					{#each activeEntry?.images || [] as image, i}{@const imageStatus = getImageStatus(image)}
						<div class="relative rounded-sm border border-black/15 bg-white p-1 shadow-sm">
							{#if getImageSrc(image)}<img src={getImageSrc(image)} alt={image.name || 'Crag picture'}
							                             class="h-20 w-full rounded-sm object-cover" />{/if}
							<div
								class="absolute left-2 top-2 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight shadow-sm {imageStatus.classes}">
								<i class="fa-solid {imageStatus.icon} mr-1"></i>{imageStatus.label}</div>
							<p class="mt-1 truncate text-micro-data text-warm-gray-500">{image.name || image.path}</p>
							<button type="button" onclick={() => onRemoveCragImage(i)}
							        class="absolute right-1 top-1 h-5 w-5 rounded-sm bg-white/90 text-warm-gray-400 hover:text-rose-600"
							        title="Remove picture"><i class="fa-solid fa-xmark text-[10px]"></i></button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<div class="space-y-0.5 pt-2 border-t border-black/15"><label for="crag-description-de" class="text-ui-label block">Description
			(DE)</label><textarea id="crag-description-de" rows="2"
		                        oninput={(event) => cragEditorState.setMetadataField('description_de', event.currentTarget.value)}
		                        value={metadata.description_de || ''}
		                        class="input-studio w-full resize-none"></textarea></div>
		<div class="space-y-0.5"><label for="crag-description-en" class="text-ui-label block">Description
			(EN)</label><textarea id="crag-description-en"
		                        value={metadata.description_en || ''}
		                        oninput={(event) => cragEditorState.setMetadataField('description_en', event.currentTarget.value)}
		                        rows="2" class="input-studio w-full resize-none"></textarea>
		</div>
	</div>
</div>

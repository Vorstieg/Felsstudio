<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.js';
	import { getCragEditorController } from '$lib/state/crag-controller-context.svelte.js';
	import { availableTags, commonEquipment, cragTypes, securityOptions } from './crag-editor-options.js';
	import { rockTypes } from '$lib/config.js';
	const cragEditorState = getCragEditorSession();
	const { metadata } = getCragEditorController();
	const { onAddEquipmentItem, onRemoveEquipmentItem, onAddCragImages, onRemoveCragImage } = metadata;
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { fileUrl } from '$lib/api/felslager.js';
	import CragHierarchyPlacement from './CragHierarchyPlacement.svelte';

	let {
		saveStatus = 'idle'
	} = $props();
	let pendingCragImageCount = $derived((cragEditorState.crag.assets?.images || []).filter((image) => image?._file).length);

	function handleCragImageInput(event) {
		onAddCragImages(Array.from(event.currentTarget.files || []));
		event.currentTarget.value = '';
	}

	function getImageSrc(image) {
		const src = image?.previewUrl || image?.path;
		if (!src) return '';
		return /^(blob:|data:|https?:\/\/)/i.test(src) ? src : fileUrl(src);
	}

	function getImageStatus(image) {
		if (!image?._file) return {
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
	<h3 class="text-ui-label text-near-black flex items-center gap-2">
		<div class="w-1.5 h-1.5 rounded-sm bg-creator-blue"></div>
		Base Information
	</h3>
	<div class="space-y-3">
		<div class="space-y-0.5"><label class="text-ui-label block">Crag Name</label><input type="text"
		                                                                    value={cragEditorState.crag.name}
					                                                                    oninput={(event) => cragEditorState.setCragField('name', event.currentTarget.value)}
		                                                                                    class="input-studio w-full"
		                                                                                    placeholder="e.g. Efeugrat" />
		</div>
		<CragHierarchyPlacement />
		<div class="grid grid-cols-2 gap-2">
			<div class="space-y-0.5"><label class="text-ui-label block">Security</label><select
				value={cragEditorState.crag.security} onchange={(event) => cragEditorState.setCragField('security', event.currentTarget.value)} class="input-studio w-full appearance-none">
				<option value="">Select...</option>
				{#each securityOptions as opt}
					<option value={opt}>{opt}</option>
				{/each}
			</select></div>
			<div class="space-y-0.5"><label class="text-ui-label block">Rock Type</label><select
					value={cragEditorState.crag.rock_type} onchange={(event) => cragEditorState.setCragField('rock_type', event.currentTarget.value)} class="input-studio w-full appearance-none">
				<option value="">Select...</option>
				{#each rockTypes as opt}
					<option value={opt}>{opt}</option>
				{/each}
			</select></div>
		</div>
		<div class="space-y-0.5"><label class="text-ui-label block">Crag Type</label>
			<TagSelector selectedTags={cragEditorState.crag.type} availableTags={cragTypes} onChange={(value) => cragEditorState.setCragField('type', value)} />
		</div>
		<div class="space-y-0.5"><label class="text-ui-label block">Tags</label>
			<TagSelector selectedTags={cragEditorState.crag.tags} availableTags={availableTags} onChange={(value) => cragEditorState.setCragField('tags', value)} />
		</div>
		<div class="space-y-1 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center"><label class="text-ui-label !m-0">Equipment</label>
				<button onclick={onAddEquipmentItem} class="text-ui-label text-creator-blue hover:text-creator-blue-active">+
					Add
				</button>
			</div>
			<div class="space-y-1">
				{#each cragEditorState.crag.equipment as item, i}
					<div class="flex gap-1 items-center bg-white p-1 rounded-sm border border-black/15 shadow-sm"><select
						value={item.name} onchange={(event) => cragEditorState.updateEquipmentItem(i, 'name', event.currentTarget.value)} class="flex-1 bg-transparent px-1 py-1 text-body-text outline-none border-none">
						{#each commonEquipment as name}
							<option value={name}>{name}</option>
						{/each}
					</select><input type="number"
					                value={item.amount} oninput={(event) => cragEditorState.updateEquipmentItem(i, 'amount', Number(event.currentTarget.value))} class="w-10 bg-black/5 px-1 py-1 rounded-sm text-body-text outline-none text-center" />
						<button onclick={() => onRemoveEquipmentItem(i)} class="text-warm-gray-300 hover:text-rose-600 px-1.5"><i
							class="fa-solid fa-trash-can text-[10px]"></i></button>
					</div>
				{/each}
			</div>
		</div>
		<div class="space-y-2 pt-2 border-t border-black/15">
			<div class="flex justify-between items-center">
				<div><label class="text-ui-label !m-0">Pictures</label>
					{#if pendingCragImageCount > 0}<p class="text-micro-data text-amber-700 !m-0">{pendingCragImageCount}
						picture{pendingCragImageCount === 1 ? '' : 's'} ready to upload. Press Save to publish.</p>{/if}
				</div>
				<label class="text-ui-label text-creator-blue hover:text-creator-blue-active cursor-pointer">+ Add<input
					type="file" accept="image/*" multiple class="hidden" onchange={handleCragImageInput} /></label></div>
			{#if (cragEditorState.crag.assets?.images || []).length === 0}<p class="text-micro-data text-warm-gray-400">No
				pictures added.</p>{:else}
				<div class="grid grid-cols-2 gap-2">
					{#each cragEditorState.crag.assets?.images || [] as image, i}{@const imageStatus = getImageStatus(image)}
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
		<div class="space-y-0.5 pt-2 border-t border-black/15"><label class="text-ui-label block">Description
			(DE)</label><textarea rows="2"
			                        oninput={(event) => cragEditorState.setCragField('description_de', event.currentTarget.value)} value={cragEditorState.crag.description_de} class="input-studio w-full resize-none"></textarea></div>
		<div class="space-y-0.5"><label class="text-ui-label block">Description (EN)</label><textarea
			value={cragEditorState.crag.description_en} oninput={(event) => cragEditorState.setCragField('description_en', event.currentTarget.value)} rows="2" class="input-studio w-full resize-none"></textarea>
		</div>
	</div>
</div>

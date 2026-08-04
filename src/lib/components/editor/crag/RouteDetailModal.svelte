<script>
	import PitchComponent from '$lib/components/editor/topo-properties/PitchComponent.svelte';
	import { createVariant } from '$lib/components/editor/topo-properties/topo-properties-utils.js';
	import { generateId } from '$lib/assets/js/id-utils.js';

	let {
		routeEntry = null,
		onClose = () => {},
		onChange = () => {},
		onAddRoutePath = () => {},
		onAssignRoutePath = () => {},
		onCreateRoutePathFromAccess = () => {},
		onEditRoutePath = () => {},
		onUpdateRoutePath = () => {},
		onRemoveRoutePath = () => {},
		onDeleteRoutePath = () => {},
		routeDocuments = [],
		accessFeatures = []
	} = $props();

	let route = $derived(routeEntry?.route ?? null);
	let document = $derived(routeEntry?.document ?? null);

	function touch() {
		if (document && route) onChange(document.path, route.id);
	}

	function paths() { return (route?.pathRefs || []).map((ref) => ({ ...ref, feature: document?.data?.paths?.features?.find((item) => String(item.id) === String(ref.pathId)) })); }
	function availablePaths() {
		const assigned = new Set((route?.pathRefs || []).map((ref) => String(ref.pathId)));
		return (document?.data?.paths?.features || []).filter((feature) => !assigned.has(String(feature.id)));
	}
	function availableAccessPaths() { return accessFeatures.filter((feature) => feature.properties?.kind === 'approach' && feature.geometry?.coordinates?.length > 1); }

	function addPitch() {
		route.pitches = [
			...(route.pitches || []),
			{
				id: generateId('pitch'),
				pitchNumber: (route.pitches?.length || 0) + 1,
				points2D: [],
				points: [],
				grade: '',
				length: 0,
				lineStyle: '',
				type: 'pitch'
			}
		];
		touch();
	}

	function removePitch(index) {
		route.pitches = route.pitches.filter((_, pitchIndex) => pitchIndex !== index);
		touch();
	}

	function addVariant() {
		route.variants = [...(route.variants || []), createVariant({ ...route, variants: route.variants || [] })];
		touch();
	}

	function removeVariant(index) {
		route.variants = route.variants.filter((_, variantIndex) => variantIndex !== index);
		touch();
	}
</script>

{#if route && document}
	<div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="presentation">
		<button
			type="button"
			class="absolute inset-0 cursor-default"
			aria-label="Close route details"
			onclick={onClose}
		></button>
		<dialog
			open
			class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-black/15 bg-white shadow-modal"
			aria-modal="true"
			aria-labelledby="route-detail-title"
		>
			<header class="flex items-center justify-between border-b border-black/10 bg-white px-4 py-3">
				<h2 id="route-detail-title" class="text-sm font-bold text-near-black">
					{route.name || 'Route details'}
				</h2>
				<button type="button" class="text-warm-gray-400 hover:text-near-black" onclick={onClose} aria-label="Close route details">
					<i class="fa-solid fa-xmark"></i>
				</button>
			</header>

			<div class="space-y-4 overflow-y-auto p-4" onchange={touch}>
				<div class="grid grid-cols-[1fr_7rem] gap-2">
					<div>
						<label class="text-ui-label block" for="route-name">Route name</label>
						<input id="route-name" class="input-studio w-full" bind:value={route.name} placeholder="Route name" />
					</div>
					<div>
						<label class="text-ui-label block" for="route-type">Type</label>
						<select id="route-type" class="input-studio w-full" bind:value={route.type}>
							<option value="sports-climbing">Sportklettern</option>
							<option value="bouldering">Bouldern</option>
							<option value="trad">Trad</option>
							<option value="multi-pitch">Multipitch</option>
							<option value="alpine-tour">Hochtour</option>
							<option value="via-ferrata">Klettersteig</option>
						</select>
					</div>
				</div>

				{#if route.type === 'multi-pitch'}
					<div class="space-y-2 rounded-sm border border-black/10 bg-black/[0.02] p-2">
						<div class="flex items-center justify-between">
							<span class="text-ui-label">Pitches</span>
							<button type="button" class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue" onclick={addPitch}>+ Add</button>
						</div>
						{#each route.pitches || [] as pitch, index}
							<PitchComponent {pitch} kind="pitch" {index} inheritLineStyle={true} onRemove={(_, index) => removePitch(index)} onChange={touch} />
						{/each}
						<div class="space-y-2 border-t border-black/10 pt-2">
							<div class="flex items-center justify-between">
								<span class="text-ui-label">Variants</span>
								<button type="button" class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue" onclick={addVariant}>+ Add</button>
							</div>
							{#each route.variants || [] as variant, index}
								<PitchComponent pitch={variant} kind="variant" {index} defaultLineStyle="variant" onRemove={(_, index) => removeVariant(index)} onChange={touch} />
							{/each}
						</div>
					</div>
				{:else}
					<PitchComponent pitch={route} showBoltCount={route.type === 'sports-climbing'} onChange={touch} />
				{/if}

				<div>
					<label class="text-ui-label block" for="route-description">Description</label>
					<textarea id="route-description" class="input-studio w-full resize-none" rows="3" bind:value={route.description} placeholder="Description"></textarea>
				</div>

				<div class="space-y-1 border-t border-black/10 pt-3">
					<div class="flex items-center justify-between gap-2">
					<span class="text-ui-label">Paths</span>
						<button type="button" class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue" onclick={() => onAddRoutePath(document.path, route.id)}>
							<i class="fa-solid fa-plus mr-1"></i>Add path
						</button>
					</div>
					{#if availablePaths().length > 0}
						<div class="flex items-center gap-1">
							<select class="input-studio min-w-0 flex-1" aria-label="Assign existing path" onchange={(event) => { const pathId = event.currentTarget.value; if (pathId) onAssignRoutePath(document.path, route.id, pathId); event.currentTarget.value = ''; }}>
								<option value="" disabled selected>Assign existing path…</option>
								{#each availablePaths() as feature}
									<option value={feature.id}>{feature.properties?.name || feature.id}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if availableAccessPaths().length > 0}
						<select class="input-studio min-w-0" aria-label="Create route path from access path" onchange={(event) => { const accessId = event.currentTarget.value; if (accessId) onCreateRoutePathFromAccess(document.path, route.id, accessId); event.currentTarget.value = ''; }}>
							<option value="" disabled selected>Copy access path…</option>
							{#each availableAccessPaths() as feature}
								<option value={feature.id}>{feature.properties?.name || feature.id}</option>
							{/each}
						</select>
					{/if}
					{#if paths().length === 0}
						<p class="text-micro-data text-warm-gray-500">No paths attached.</p>
					{:else}
						{#each paths() as pathAsset}
							<div class="grid grid-cols-[7rem_1fr_7rem_1.5rem_1.5rem] gap-1 rounded-sm border border-black/10 bg-white p-1">
								<select class="input-studio min-w-0" value={pathAsset.role || 'main'} onchange={(event) => onUpdateRoutePath(document.path, route.id, pathAsset.pathId, 'role', event.currentTarget.value)}>
									<option value="approach">Approach</option>
									<option value="main">Main</option>
									<option value="descent">Descent</option>
									<option value="variant">Variant</option>
								</select>
								<input class="input-studio min-w-0" value={pathAsset.label || ''} placeholder="Label" onchange={(event) => onUpdateRoutePath(document.path, route.id, pathAsset.pathId, 'label', event.currentTarget.value)} />
								<span class="px-1 text-micro-data text-warm-gray-500">{pathAsset.feature?.properties?.name || pathAsset.pathId}</span>
								<button type="button" class="text-warm-gray-400 hover:text-creator-blue" title="Edit path" onclick={() => onEditRoutePath(document.path, route.id, pathAsset.pathId)}><i class="fa-solid fa-pencil text-[10px]"></i></button>
								<button type="button" class="text-warm-gray-300 hover:text-rose-600" title="Unassign path" onclick={() => onRemoveRoutePath(document.path, route.id, pathAsset.pathId)}><i class="fa-solid fa-xmark text-[10px]"></i></button>
								<button type="button" class="text-warm-gray-300 hover:text-rose-600" title="Delete shared path" onclick={() => onDeleteRoutePath(document.path, pathAsset.pathId)}><i class="fa-solid fa-trash text-[10px]"></i></button>
							</div>
						{/each}
					{/if}
					<p class="text-micro-data text-warm-gray-500">Stored in {document.path.split('/').at(-1)}</p>
				</div>
			</div>
		</dialog>
	</div>
{/if}

<script>
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	import {
		createPolygonAround,
		getGeometryCenter,
		translateGeometryTo
	} from '$lib/assets/js/sector-utils.js';

	let { open = true, onClose = null } = $props();
	const cragEditorState = getCragEditorSession();
	const { geometryEditor } = getCragEditorTools();
	let metadata = $derived(cragEditorState.getMetadataTarget() || cragEditorState.crag);
	let geometryCenter = $derived(getGeometryCenter(metadata.geometry) || [0, 0]);
	let selectedGeometryVertex = $derived(geometryEditor.selectedVertex);

	function setGeometryType(type) {
		const center =
			getGeometryCenter(metadata.geometry) ||
			getGeometryCenter(cragEditorState.crag.geometry) ||
			[0, 0];
		cragEditorState.commitGeometry(
			cragEditorState.activeMetadataTarget,
			type === 'Polygon'
				? createPolygonAround(center)
				: { type: 'Point', coordinates: [...center] },
			`Convert geometry to ${type}`
		);
		geometryEditor.clearSelection();
	}

	function setGeometryCoordinate(index, value) {
		const center = [...(getGeometryCenter(metadata.geometry) || [0, 0])];
		const coordinate = Number(value);
		if (!Number.isFinite(coordinate)) return;
		center[index] = coordinate;
		cragEditorState.commitGeometry(
			cragEditorState.activeMetadataTarget,
			translateGeometryTo(metadata.geometry, center),
			'Update geometry coordinates'
		);
	}
</script>

<ToolOptions title="Edit Geometry" {open} {onClose}>
	<div class="rounded-sm border border-black/10 bg-black/[0.03] p-2">
		<p class="text-ui-label !m-0 truncate">{metadata.name || metadata.id || 'Active target'}</p>
		<p class="mt-0.5 text-micro-data text-warm-gray-400">
			{cragEditorState.activeMetadataTarget?.type === 'sector' ? 'Sector' : 'Hierarchy entry'}
		</p>
	</div>

	<div class="grid grid-cols-2 gap-1 rounded-sm border border-black/10 bg-black/5 p-0.5">
		{#each ['Point', 'Polygon'] as type}
			<button
				type="button"
				class="rounded-sm py-2 text-ui-label transition-none {metadata.geometry?.type === type
					? 'bg-white text-creator-blue shadow-sm'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => setGeometryType(type)}
			>{type}</button>
		{/each}
	</div>

	<div class="rounded-sm border border-black/10 bg-black/[0.03] p-2">
		<div class="flex items-center justify-between gap-2">
			<p class="text-ui-label !m-0">Position</p>
			<button
				type="button"
				onclick={() => geometryEditor.moveTargetToMapCenter()}
				class="rounded-sm border border-black/10 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue hover:bg-creator-blue/5"
				title="Move this geometry to the current center of the map"
			>
				<i class="fa-solid fa-crosshairs"></i> Move to map center
			</button>
		</div>
		<p class="mt-1 text-micro-data text-warm-gray-400">
			Pan to the destination, then move the entire geometry there.
		</p>
		<div class="mt-2 grid grid-cols-2 gap-2">
			<div>
				<label for="geometry-tool-longitude" class="text-micro-data text-warm-gray-500">Longitude</label>
				<input
					id="geometry-tool-longitude"
					type="number"
					step="any"
					value={geometryCenter[0]}
					onchange={(event) => setGeometryCoordinate(0, event.currentTarget.value)}
					class="input-studio w-full font-mono"
				/>
			</div>
			<div>
				<label for="geometry-tool-latitude" class="text-micro-data text-warm-gray-500">Latitude</label>
				<input
					id="geometry-tool-latitude"
					type="number"
					step="any"
					value={geometryCenter[1]}
					onchange={(event) => setGeometryCoordinate(1, event.currentTarget.value)}
					class="input-studio w-full font-mono"
				/>
			</div>
		</div>
	</div>

	{#if metadata.geometry?.type === 'Polygon'}
		{#if selectedGeometryVertex}
			<button
				type="button"
				onclick={() => geometryEditor.deleteSelectedVertex()}
				class="flex min-h-10 w-full items-center justify-center gap-2 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-ui-label font-bold text-rose-700 hover:bg-rose-100"
			>
				<i class="fa-solid fa-trash-can"></i> Delete selected vertex
			</button>
		{/if}
	{/if}
</ToolOptions>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { FelsTopoDocument, PathFeature, Route } from '@vorstieg/fels-types/types';
	import type { FelsEntryWorkspace } from '$lib/types/crag';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import type { CragSelection } from './crag-route-types.ts';
	type AccessKind = 'parking' | 'transit' | 'hut' | 'approach';
	type AccessFeature = {
		id: string;
		properties: { kind: AccessKind; name?: string; mode?: 'bus' | 'train'; [key: string]: unknown };
	};
	type DetectedAsset = {
		id: string;
		name: string;
		kind: 'parking' | 'transit' | 'hut';
		mode: 'bus' | 'train' | null;
		coordinates: [number, number];
		distance: number;
	};
	type SelectedObject = CragSelection;
	type TopoEntry = { path: string; data: FelsTopoDocument };
	type RegistryPathFeature = PathFeature & {
		properties?: {
			name?: string;
			description?: string;
			accessFeatureId?: string;
			[key: string]: unknown;
		};
	};
	type Props = {
		detectedAssets?: DetectedAsset[];
		isDetectionLoading?: boolean;
		isDetectionZoomLimited?: boolean;
		selectedObject?: SelectedObject | null;
	};

	const cragEditorState = getCragEditorSession();
	const { accessEditor, trackEditor, routeTool, actions } = getCragEditorTools();
	const {
		addRoutePath: onAddRoutePath,
		editRoutePath: onEditRoutePath,
		duplicateRoutePath: onDuplicateRoutePath,
		deleteRoutePath: onDeleteRoutePath,
		moveApproachTrackToTopoPaths: onMoveApproachTrackToTopoPaths,
		updateRoutePathFeature: onUpdateRoutePathFeature
	} = routeTool;
	const {
		setHoverHighlight: onSetHoverHighlight,
		clearDetectedAssets: onClearDetectedAssets,
		addDetectedAsset: onAddDetectedAsset,
		removeAccessFeature: onRemoveAccessFeature
	} = accessEditor;
	const { editTrack: onEditTrack, removeTrack: onRemoveTrack } = trackEditor;
	let activeWorkspace = $derived<FelsEntryWorkspace | null>(
		cragEditorState.getActiveWorkspaceEntry()
	);
	let topoEntries = $derived.by<TopoEntry[]>(() =>
		[activeWorkspace, ...(activeWorkspace?.childEntries || [])].flatMap((node) =>
			node?.entry?.properties.id && node.topo
				? [
						{
							path: `${node.path}/${node.entry.properties.id}/${node.entry.properties.id}-topo.json`,
							data: node.topo
						}
					]
				: []
		)
	);

	let {
		detectedAssets = [],
		isDetectionLoading = false,
		isDetectionZoomLimited = false,
		selectedObject = $bindable(null)
	}: Props = $props();
	let accessFeatures = $derived((activeWorkspace?.access?.features || []) as AccessFeature[]);
	let transitFeatures = $derived(
		accessFeatures.filter((feature) => feature.properties?.kind === 'transit')
	);
	let parkingFeatures = $derived(
		accessFeatures.filter((feature) => feature.properties?.kind === 'parking')
	);
	let hutFeatures = $derived(
		accessFeatures.filter((feature) => feature.properties?.kind === 'hut')
	);
	let approachFeatures = $derived(
		accessFeatures.filter((feature) => feature.properties?.kind === 'approach')
	);
	let assignableAccessFeatures = $derived(
		accessFeatures.filter((feature) => feature.properties?.kind !== 'approach')
	);
	let topoPathCount = $derived(
		topoEntries.reduce(
			(count, document) => count + (document.data?.paths?.features?.length || 0),
			0
		)
	);

	function topoPaths(document: TopoEntry): RegistryPathFeature[] {
		return (document.data.paths?.features || []) as RegistryPathFeature[];
	}

	function assignedRoutes(document: TopoEntry, pathId: string | number | undefined): Route[] {
		return (document.data?.routes || []).filter((route) =>
			(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
		);
	}

	function isSelectedApproach(track: AccessFeature): boolean {
		return selectedObject?.type === 'approach' && selectedObject.id === track.id;
	}

	function isSelectedPath(
		document: TopoEntry,
		feature: RegistryPathFeature,
		pathIndex: number
	): boolean {
		return (
			selectedObject?.type === 'route-path' &&
			selectedObject.documentPath === document.path &&
			String(selectedObject.pathId) === String(feature.id) &&
			(selectedObject.pathIndex == null || Number(selectedObject.pathIndex) === pathIndex)
		);
	}

	function selectApproach(track: AccessFeature): void {
		void actions.selectObject({ type: 'approach', id: track.id });
	}

	function selectPath(document: TopoEntry, feature: RegistryPathFeature, pathIndex: number): void {
		void actions.selectObject({
			type: 'route-path',
			documentPath: document.path,
			pathId: String(feature.id),
			pathIndex
		});
	}

	function editPath(document: TopoEntry, feature: RegistryPathFeature, pathIndex: number): void {
		selectPath(document, feature, pathIndex);
		const route = assignedRoutes(document, feature.id)[0];
		onEditRoutePath(document.path, route?.id, feature.id, pathIndex);
	}

	function duplicatePath(document: TopoEntry, feature: RegistryPathFeature): void {
		onDuplicateRoutePath(document.path, feature.id);
	}

	function accessFeatureLabel(feature: AccessFeature): string {
		const kindLabels: Record<AccessKind, string> = {
			parking: $_('editor.parking'),
			hut: $_('editor.hut'),
			transit: $_('editor.transit'),
			approach: $_('editor.approach')
		};
		const kindLabel = kindLabels[feature.properties.kind];
		return feature?.properties?.name
			? `${feature.properties.name} (${kindLabel})`
			: `${kindLabel} ${feature?.id || ''}`;
	}

	function moveApproachTrack(
		event: Event & { currentTarget: HTMLSelectElement },
		track: AccessFeature
	): void {
		const documentPath = event.currentTarget.value;
		if (!documentPath) return;
		onMoveApproachTrackToTopoPaths(documentPath, track.id);
		if (isSelectedApproach(track)) selectedObject = null;
		event.currentTarget.value = '';
	}
</script>

<div class="flex flex-col gap-2">
	{#if isDetectionLoading}
		<div
			class="flex items-center gap-2 rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2 text-ui-label text-creator-blue"
		>
			<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
			<span>{$_('editor.searching_nearby_access_points')}</span>
		</div>
	{/if}
	{#if isDetectionZoomLimited}
		<div
			class="flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-50 p-2 text-ui-label text-amber-800"
		>
			<i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true"></i>
			<span>{$_('editor.nearby_access_zoom_hint')}</span>
		</div>
	{/if}
	{#if detectedAssets.length > 0}
		<div class="bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5 mb-1">
			<div class="flex justify-between items-center">
				<span class="text-ui-label text-creator-blue">{$_('ui.nearby_suggestions')}</span>
				<button
					class="text-micro-data font-bold text-warm-gray-400 hover:text-near-black"
					onclick={() => {
						onClearDetectedAssets();
						onSetHoverHighlight(null);
					}}>{$_('ui.dismiss')}</button
				>
			</div>
			<div class="space-y-1">
				{#each detectedAssets as asset}
					<div
						class="detected-asset-row bg-white rounded-sm p-1.5 shadow-sm border border-black/15 flex items-center justify-between gap-2"
						onmouseenter={() => onSetHoverHighlight(asset)}
						onmouseleave={() => onSetHoverHighlight(null)}
						role="presentation"
					>
						<div class="flex items-center gap-2">
							<div
								class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data"
							>
								{#if asset.kind === 'parking'}<i class="fa-solid fa-square-parking"
									></i>{:else if asset.kind === 'hut'}
									<i class="fa-solid fa-house"></i>{:else if asset.mode === 'bus'}<i
										class="fa-solid fa-bus"
									></i>{:else}
									<i class="fa-solid fa-train"></i>{/if}
							</div>
							<p class="text-body-text font-bold text-near-black truncate leading-tight w-28">
								{asset.name}
							</p>
						</div>
						<button
							class="px-2 py-1 bg-creator-blue text-white rounded-sm text-micro-data font-bold hover:bg-creator-blue-active"
							onclick={() => onAddDetectedAsset(asset)}
							>{$_('editor.add')}
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
	{#if accessFeatures.length === 0 && detectedAssets.length === 0}
		<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15 mt-2">
			<i class="fa-solid fa-layer-group text-2xl text-warm-gray-300 mb-2 block"></i>
			<p class="text-ui-label text-warm-gray-500">{$_('editor.inventory_empty')}</p>
		</div>
	{/if}
	{#each transitFeatures as point}
		<div class="panel-inner p-2 flex flex-col gap-2 border-black/10 hover:border-creator-blue">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10"
					>
						<i class="fa-solid fa-bus text-[10px]"></i>
					</div>
					<span class="text-ui-label text-near-black !m-0">{$_('editor.transit_point')}</span>
				</div>
				<button
					onclick={() => onRemoveAccessFeature(point.id)}
					aria-label={$_('editor.remove_transit_point')}
					class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"
					><i class="fa-solid fa-trash-can text-[10px]"></i></button
				>
			</div>
			<div class="flex gap-1.5">
				<select bind:value={point.properties.mode} class="input-studio w-16 !px-1 appearance-none">
					<option value="bus">{$_('editor.bus')}</option>
					<option value="train">{$_('editor.train')}</option>
				</select><input
					type="text"
					bind:value={point.properties.name}
					class="input-studio flex-1"
					placeholder={$_('editor.station_name')}
				/>
			</div>
		</div>
	{/each}
	{#each parkingFeatures as point}
		<div
			class="panel-inner p-2 flex justify-between items-center border-black/10 hover:border-creator-blue"
		>
			<div class="flex items-center gap-2">
				<div
					class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 border border-black/10"
				>
					<i class="fa-solid fa-square-parking text-[10px]"></i>
				</div>
				<span class="text-ui-label text-near-black !m-0">{$_('editor.parking_space')}</span>
			</div>
			<button
				onclick={() => onRemoveAccessFeature(point.id)}
				aria-label={$_('editor.remove_parking_space')}
				class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"
				><i class="fa-solid fa-trash-can text-[10px]"></i></button
			>
		</div>
	{/each}
	{#each hutFeatures as hut}
		<div class="panel-inner p-2 flex flex-col gap-2 border-black/10 hover:border-creator-blue">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200"
					>
						<i class="fa-solid fa-house text-[10px]"></i>
					</div>
					<span class="text-ui-label text-near-black !m-0">{$_('editor.mountain_hut')}</span>
				</div>
				<button
					onclick={() => onRemoveAccessFeature(hut.id)}
					aria-label={$_('editor.remove_mountain_hut')}
					class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"
					><i class="fa-solid fa-trash-can text-[10px]"></i></button
				>
			</div>
			<input
				type="text"
				bind:value={hut.properties.name}
				class="input-studio w-full"
				placeholder={$_('editor.hut_name')}
			/>
		</div>
	{/each}
	{#each approachFeatures as track}
		<div
			class="panel-inner p-2 flex flex-col gap-2 hover:border-creator-blue {isSelectedApproach(
				track
			)
				? 'border-creator-blue bg-creator-blue/5 ring-1 ring-creator-blue/20'
				: 'border-black/10'}"
			onclick={() => selectApproach(track)}
			role="button"
			tabindex="0"
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') selectApproach(track);
			}}
		>
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10"
					>
						<i class="fa-solid fa-route text-[10px]"></i>
					</div>
					<span class="text-ui-label text-near-black !m-0">{$_('editor.approach_track')}</span>
				</div>
				<div class="flex items-center gap-1">
					<button
						onclick={(event) => {
							event.stopPropagation();
							selectApproach(track);
							onEditTrack(track.id);
						}}
						class="w-6 h-6 text-warm-gray-400"
						title={$_('editor.edit_approach_track')}
					>
						<i class="fa-solid fa-pen text-[10px]"></i></button
					>
					<button
						onclick={(event) => {
							event.stopPropagation();
							onRemoveTrack(track.id);
							if (isSelectedApproach(track)) selectedObject = null;
						}}
						class="w-6 h-6 text-warm-gray-300 hover:text-rose-600"
						title={$_('editor.delete_approach_track')}
						><i class="fa-solid fa-trash-can text-[10px]"></i></button
					>
				</div>
			</div>
			<input
				type="text"
				bind:value={track.properties.name}
				class="input-studio w-full"
				placeholder={$_('editor.track_name')}
			/>
			{#if topoEntries.length > 0}
				<select
					class="input-studio w-full"
					aria-label={$_('editor.move_approach_track_to_topo_paths')}
					onchange={(event) => moveApproachTrack(event, track)}
				>
					<option value="" selected>{$_('editor.move_to_topo_paths')}</option>
					{#each topoEntries as document}
						<option value={document.path}>{document.path.split('/').at(-1)}</option>
					{/each}
				</select>
			{:else}
				<div class="text-micro-data text-warm-gray-500">
					{$_('editor.add_a_route_first_to_create_a_topo_path_destination')}
				</div>
			{/if}
		</div>
	{/each}
	<div class="mt-3 space-y-2 border-t border-black/10 pt-3">
		<div class="flex items-center justify-between">
			<div>
				<div class="text-ui-label">{$_('editor.topo_paths')}</div>
				<div class="text-micro-data text-warm-gray-500">
					{$_('editor.path_count', { values: { count: topoPathCount } })}
				</div>
			</div>
		</div>
		{#each topoEntries as document}
			<div class="space-y-2 rounded-sm border border-black/10 bg-white p-2.5 shadow-sm">
				<div class="flex items-center justify-between gap-2 border-b border-black/5 pb-2">
					<div class="min-w-0">
						<div class="text-micro-data font-bold text-warm-gray-500">
							{document.path.split('/').at(-1)}
						</div>
						<div class="text-micro-data text-warm-gray-400">{$_('editor.topo_source')}</div>
					</div>
					{#if document.data?.routes?.[0]}
						<button
							type="button"
							class="inline-flex shrink-0 items-center gap-1 rounded-sm bg-creator-blue px-2 py-1 text-micro-data font-bold text-white hover:bg-creator-blue/90"
							onclick={() => onAddRoutePath(document.path, document.data.routes[0].id)}
						>
							<i class="fa-solid fa-pen-ruler text-[10px]"></i>
							{$_('editor.draw_path')}
						</button>
					{/if}
				</div>
				{#each topoPaths(document) as feature, pathIndex}
					{@const routes = assignedRoutes(document, feature.id)}
					<div
						class="space-y-2 rounded-sm border p-2 {isSelectedPath(document, feature, pathIndex)
							? 'border-creator-blue bg-creator-blue/5 ring-1 ring-creator-blue/20'
							: 'border-black/10 bg-warm-white/40'}"
						onclick={() => selectPath(document, feature, pathIndex)}
						role="button"
						tabindex="0"
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ')
								selectPath(document, feature, pathIndex);
						}}
					>
						<div class="flex items-start justify-between gap-2">
							<input
								class="path-name-input input-studio min-w-0 flex-1 !border-0 !bg-transparent !px-0 !py-0 text-body-text font-bold text-near-black focus:!ring-0"
								value={feature.properties?.name || ''}
								placeholder={$_('editor.unnamed_path')}
								aria-label={$_('editor.path_name')}
								onchange={(event) => {
									onUpdateRoutePathFeature(document.path, feature.id, {
										name: event.currentTarget.value
									});
								}}
							/>
							<span
								class="shrink-0 rounded-sm bg-black/5 px-1.5 py-0.5 text-micro-data text-warm-gray-500"
								>{$_('editor.route_count', { values: { count: routes.length } })}</span
							>
						</div>
						<div class="flex min-w-0 items-center gap-2 text-micro-data text-warm-gray-500">
							{#if routes.length > 0}{$_('editor.used_by')}
								{routes.map((route) => route.name || route.id).join(', ')}{:else}{$_(
									'editor.not_assigned_to_a_route'
								)}
							{/if}
							<span id="route-edit-buttons" class="ml-auto inline-flex shrink-0 items-center gap-1">
								<button
									type="button"
									class="action-button text-creator-blue"
									title={$_('editor.edit_path')}
									aria-label={$_('editor.edit_path')}
									onclick={(event) => {
										event.stopPropagation();
										editPath(document, feature, pathIndex);
									}}
								>
									<i class="fa-solid fa-pen text-[10px]"></i>
								</button>
								<button
									type="button"
									class="action-button text-warm-gray-500 hover:text-creator-blue"
									title={$_('editor.duplicate_path')}
									aria-label={$_('editor.duplicate_path')}
									onclick={(event) => {
										event.stopPropagation();
										duplicatePath(document, feature);
									}}
								>
									<i class="fa-solid fa-copy text-[10px]"></i>
								</button>
								<button
									type="button"
									class="action-button text-rose-600"
									title={$_('editor.delete_path')}
									aria-label={$_('editor.delete_path')}
									onclick={(event) => {
										event.stopPropagation();
										onDeleteRoutePath(document.path, feature.id, pathIndex);
										if (isSelectedPath(document, feature, pathIndex)) selectedObject = null;
									}}
								>
									<i class="fa-solid fa-trash-can text-[10px]"></i>
								</button>
							</span>
						</div>
						<div class="space-y-1" onclick={(event) => event.stopPropagation()} role="presentation">
							<label
								class="text-micro-data font-bold uppercase tracking-wide text-warm-gray-400"
								for={`path-description-${document.path}-${feature.id}`}
								>{$_('editor.path_text')}</label
							>
							<textarea
								id={`path-description-${document.path}-${feature.id}`}
								class="input-studio w-full resize-none"
								rows="3"
								value={feature.properties?.description || ''}
								placeholder={$_('editor.example_path')}
								oninput={(event) =>
									onUpdateRoutePathFeature(document.path, feature.id, {
										description: event.currentTarget.value
									})}
							></textarea>
						</div>
						{#if assignableAccessFeatures.length > 0}
							<select
								class="input-studio w-full"
								aria-label={$_('editor.assign_access_feature')}
								value={feature.properties?.accessFeatureId || ''}
								onclick={(event) => event.stopPropagation()}
								onchange={(event) =>
									onUpdateRoutePathFeature(document.path, feature.id, {
										accessFeatureId: event.currentTarget.value
									})}
							>
								<option value="">{$_('editor.no_access_feature')}</option>
								{#each assignableAccessFeatures as accessFeature}
									<option value={accessFeature.id}>{accessFeatureLabel(accessFeature)}</option>
								{/each}
							</select>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.detected-asset-row {
		cursor: pointer;
	}

	.detected-asset-row:hover {
		border-color: #0075de !important;
	}

	.path-name-input {
		min-height: 1.25rem;
	}

	.action-button {
		display: inline-flex;
		width: 1.5rem;
		height: 1.5rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.125rem;
	}

	.action-button:hover {
		background: rgb(0 0 0 / 0.05);
	}
</style>

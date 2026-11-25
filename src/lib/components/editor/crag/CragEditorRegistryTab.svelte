<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { FelsTopoDocument, PathFeature, Route } from '@vorstieg/fels-types/types';
	import type { FelsEntryWorkspace } from '$lib/types/crag';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import { workspaceNodeDocumentPaths } from '$lib/assets/js/workspace-paths.ts';
	import type { CragSelection, RoutePathRef } from './crag-route-types.ts';
	import {
		ROUTE_PATH_ROLES,
		getPrimaryPathRole,
		getRoutePathRoleMeta,
		inferRoutePathRole,
		nextRoutePathRole
	} from './route-path-roles.ts';

	type AccessKind = 'parking' | 'transit' | 'hut' | 'approach';
	type AccessFeature = {
		id: string;
		properties: {
			kind: AccessKind;
			name?: string;
			description?: string;
			mode?: 'bus' | 'train';
			[key: string]: unknown;
		};
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
	type TopoEntry = { path: string; name: string; data: FelsTopoDocument };
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
		assignExistingRoutePath: onAssignExistingRoutePath,
		assignPathToAllRoutes: onAssignPathToAllRoutes,
		assignAccessTrackToRoutes: onAssignAccessTrackToRoutes,
		assignAccessTrackToAllRoutes: onAssignAccessTrackToAllRoutes,
		moveTopoPathToCragApproach: onMoveTopoPathToCragApproach,
		duplicateApproachTrack: onDuplicateApproachTrack,
		updateRoutePath: onUpdateRoutePath,
		removeRoutePath: onRemoveRoutePath,
		editRoutePath: onEditRoutePath,
		duplicateRoutePath: onDuplicateRoutePath,
		deleteRoutePath: onDeleteRoutePath,
		updateRoutePathFeature: onUpdateRoutePathFeature
	} = routeTool;
	const {
		setHoverHighlight: onSetHoverHighlight,
		clearDetectedAssets: onClearDetectedAssets,
		addDetectedAsset: onAddDetectedAsset,
		removeAccessFeature: onRemoveAccessFeature
	} = accessEditor;
	const {
		editTrack: onEditTrack,
		removeTrack: onRemoveTrack,
		startRoutingDraft: onStartRoutingDraft
	} = trackEditor;

	let activeWorkspace = $derived<FelsEntryWorkspace | null>(
		cragEditorState.getActiveWorkspaceEntry()
	);
	let topoEntries = $derived.by<TopoEntry[]>(() =>
		[activeWorkspace, ...(activeWorkspace?.childEntries || [])].flatMap((node) =>
			node?.entry?.properties.id && node.topo
				? [
						{
							path: workspaceNodeDocumentPaths(node).topo,
							name: node.entry.properties.name || node.topo.name || node.entry.properties.id,
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
	let accessPointCount = $derived(
		transitFeatures.length + parkingFeatures.length + hutFeatures.length
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
	let totalPathCount = $derived(approachFeatures.length + topoPathCount);
	let allTopoRoutes = $derived(
		topoEntries.flatMap((document) =>
			(document.data?.routes || []).map((route) => ({ document, route }))
		)
	);

	function updateAccessFeature(
		featureId: string,
		patch: Partial<AccessFeature['properties']>
	): void {
		if (!activeWorkspace) return;
		const accessPath = workspaceNodeDocumentPaths(activeWorkspace).access;
		cragEditorState.updateWorkspaceAccess(
			accessPath,
			(access) => {
				const target = (access.features as AccessFeature[]).find((item) => item.id === featureId);
				if (!target) return;
				target.properties = { ...(target.properties || {}), ...patch } as AccessFeature['properties'];
			},
			cragEditorState.getWorkspaceEntryPath(activeWorkspace)
		);
	}

	function topoPaths(document: TopoEntry): RegistryPathFeature[] {
		return (document.data.paths?.features || []) as RegistryPathFeature[];
	}

	function assignedRoutes(document: TopoEntry, pathId: string | number | undefined): Route[] {
		return (document.data?.routes || []).filter((route) =>
			(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
		);
	}

	function assignedRouteEntries(
		document: TopoEntry,
		pathId: string | number | undefined
	): Array<{ route: Route; ref: RoutePathRef }> {
		const entries: Array<{ route: Route; ref: RoutePathRef }> = [];
		for (const route of document.data?.routes || []) {
			const ref = (route.pathRefs || []).find((item) => String(item.pathId) === String(pathId));
			if (ref) entries.push({ route, ref });
		}
		return entries;
	}

	function unassignedRoutes(document: TopoEntry, pathId: string | number | undefined): Route[] {
		return (document.data?.routes || []).filter(
			(route) => !(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
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

	function assignCragApproachToRoute(
		event: Event & { currentTarget: HTMLSelectElement },
		track: AccessFeature
	): void {
		const value = event.currentTarget.value;
		if (!value) return;
		const role = inferRoutePathRole(track.properties?.name, 'approach');
		const sep = value.indexOf('::');
		if (sep > 0) {
			const documentPath = value.slice(0, sep);
			const routeId = value.slice(sep + 2);
			onAssignAccessTrackToRoutes(documentPath, track.id, [routeId], role);
		}
		event.currentTarget.value = '';
	}
</script>

<div class="flex flex-col gap-3">
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
		<div class="bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5">
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

	{#if accessPointCount === 0 && totalPathCount === 0 && detectedAssets.length === 0}
		<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15">
			<i class="fa-solid fa-layer-group text-2xl text-warm-gray-300 mb-2 block"></i>
			<p class="text-ui-label text-warm-gray-500">{$_('editor.inventory_empty')}</p>
		</div>
	{/if}

	{#if accessPointCount > 0}
		<div class="space-y-1.5">
			<div class="text-ui-label">{$_('editor.access_points')}</div>
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
						<select
							value={point.properties.mode || 'bus'}
							onchange={(event) =>
								updateAccessFeature(point.id, {
									mode: event.currentTarget.value as 'bus' | 'train'
								})}
							class="input-studio w-16 !px-1 appearance-none"
						>
							<option value="bus">{$_('editor.bus')}</option>
							<option value="train">{$_('editor.train')}</option>
						</select><input
							type="text"
							value={point.properties.name || ''}
							onchange={(event) =>
								updateAccessFeature(point.id, { name: event.currentTarget.value })}
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
						value={hut.properties.name || ''}
						onchange={(event) => updateAccessFeature(hut.id, { name: event.currentTarget.value })}
						class="input-studio w-full"
						placeholder={$_('editor.hut_name')}
					/>
				</div>
			{/each}
		</div>
	{/if}

	<div class="space-y-2 {accessPointCount > 0 ? 'border-t border-black/10 pt-3' : ''}">
		<div class="flex items-center justify-between gap-2">
			<div>
				<div class="text-ui-label">{$_('editor.paths')}</div>
				<div class="text-micro-data text-warm-gray-500">
					{$_('editor.path_count', { values: { count: totalPathCount } })}
				</div>
			</div>
			<button
				type="button"
				class="inline-flex shrink-0 items-center gap-1 rounded-sm bg-creator-blue px-2 py-1 text-micro-data font-bold text-white hover:bg-creator-blue/90"
				onclick={() => trackEditor.requestLeave(onStartRoutingDraft)}
			>
				<i class="fa-solid fa-pen-ruler text-[10px]"></i>
				{$_('editor.draw_path')}
			</button>
		</div>

		{#if totalPathCount > 0}
			<div class="flex flex-wrap items-center gap-1.5">
				{#each ROUTE_PATH_ROLES as roleMeta}
					<span
						class={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${roleMeta.badgeClass}`}
					>
						<span class={`h-1.5 w-1.5 rounded-full ${roleMeta.dotClass}`} aria-hidden="true"></span>
						{$_(roleMeta.shortLabelKey)}
					</span>
				{/each}
			</div>

			<div class="space-y-2">
				{#each approachFeatures as track}
					{@const approachMeta = getRoutePathRoleMeta('approach')}
					{@const defaultRole = inferRoutePathRole(track.properties?.name, 'approach')}
					<div
						class="space-y-2 rounded-sm border p-2 transition-none {isSelectedApproach(track)
							? 'border-creator-blue bg-creator-blue/5 ring-1 ring-creator-blue/20'
							: 'border-black/10 bg-white'}"
						onclick={() => selectApproach(track)}
						role="button"
						tabindex="0"
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') selectApproach(track);
						}}
					>
						<div class="flex items-center justify-between gap-1.5">
							<span
								class={`h-2.5 w-2.5 shrink-0 rounded-full ${approachMeta.dotClass}`}
								aria-hidden="true"
							></span>
							<input
								type="text"
								value={track.properties?.name || ''}
								class="path-name-input input-studio min-w-0 flex-1 !border-0 !bg-transparent !px-0 !py-0 text-body-text font-bold text-near-black focus:!ring-0"
								placeholder={$_('editor.unnamed_path')}
								aria-label={$_('editor.path_name')}
								onclick={(event) => event.stopPropagation()}
								onchange={(event) =>
									updateAccessFeature(track.id, { name: event.currentTarget.value })}
							/>
							<span class="inline-flex shrink-0 items-center gap-0.5">
								<button
									type="button"
									class="action-button text-creator-blue"
									title={$_('editor.edit_path')}
									aria-label={$_('editor.edit_path')}
									onclick={(event) => {
										event.stopPropagation();
										selectApproach(track);
										onEditTrack(track.id);
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
										onDuplicateApproachTrack(track.id);
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
										onRemoveTrack(track.id);
										if (isSelectedApproach(track)) selectedObject = null;
									}}
								>
									<i class="fa-solid fa-trash-can text-[10px]"></i>
								</button>
							</span>
						</div>

						<div
							class="space-y-1.5"
							onclick={(event) => event.stopPropagation()}
							role="presentation"
						>
							<div class="flex flex-wrap items-center gap-1">
								<span
									class="inline-flex items-center gap-1 rounded-sm border border-black/10 bg-warm-white px-1.5 py-0.5 text-[10px]"
								>
									<span class="font-semibold text-near-black">{$_('editor.whole_crag')}</span>
									<span
										class={`rounded-sm border px-1 py-0.5 text-[9px] font-bold leading-none ${approachMeta.badgeClass}`}
									>
										{$_(approachMeta.shortLabelKey)}
									</span>
								</span>
							</div>
							{#if allTopoRoutes.length > 0}
								<div class="flex items-center gap-1">
									<select
										class="input-studio min-w-0 flex-1 bg-white text-[11px]"
										aria-label={$_('editor.assign_route')}
										onchange={(event) => assignCragApproachToRoute(event, track)}
									>
										<option value="" selected>+ {$_('editor.assign_route')}</option>
										{#each allTopoRoutes as { document, route }}
											<option value={`${document.path}::${route.id}`}>
												{route.name || $_('editor.unnamed_route')}{route.grade
													? ` (${route.grade})`
													: ''}{topoEntries.length > 1 ? ` · ${document.name}` : ''}
											</option>
										{/each}
									</select>
									{#if allTopoRoutes.length > 1}
										<button
											type="button"
											class="shrink-0 rounded-sm border border-black/15 bg-white px-2 py-1 text-[10px] font-bold text-creator-blue hover:bg-creator-blue/5"
											title={$_('editor.assign_to_all_routes')}
											onclick={() => onAssignAccessTrackToAllRoutes(track.id, defaultRole)}
										>
											{$_('editor.assign_all_routes')}
										</button>
									{/if}
								</div>
							{/if}
						</div>

						<div
							class="border-t border-black/5 pt-1.5"
							onclick={(event) => event.stopPropagation()}
							role="presentation"
						>
							<details>
								<summary
									class="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-warm-gray-400 hover:text-near-black"
								>
									<i class="fa-solid fa-chevron-right details-arrow text-[8px]" aria-hidden="true"
									></i>
									<span class="truncate">
										{#if track.properties?.description}
											{track.properties.description}
										{:else}
											{$_('editor.path_details')}
										{/if}
									</span>
								</summary>
								<div class="mt-1.5 space-y-1.5">
									<textarea
										class="input-studio w-full resize-none bg-white"
										rows="2"
										value={track.properties?.description || ''}
										placeholder={$_('editor.example_path')}
										aria-label={$_('editor.path_text')}
										onchange={(event) =>
											updateAccessFeature(track.id, { description: event.currentTarget.value })}
									></textarea>
								</div>
							</details>
						</div>
					</div>
				{/each}

				{#each topoEntries as document}
					{#each topoPaths(document) as feature, pathIndex}
						{@const assignments = assignedRouteEntries(document, feature.id)}
						{@const unassigned = unassignedRoutes(document, feature.id)}
						{@const primaryRole = getPrimaryPathRole(document.data, feature)}
						{@const primaryMeta = getRoutePathRoleMeta(primaryRole)}
						{@const defaultAssignRole = inferRoutePathRole(feature.properties?.name, primaryRole)}
						<div
							class="space-y-2 rounded-sm border p-2 transition-none {isSelectedPath(
								document,
								feature,
								pathIndex
							)
								? 'border-creator-blue bg-creator-blue/5 ring-1 ring-creator-blue/20'
								: 'border-black/10 bg-white'}"
							onclick={() => selectPath(document, feature, pathIndex)}
							role="button"
							tabindex="0"
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ')
									selectPath(document, feature, pathIndex);
							}}
						>
							<div class="flex items-center justify-between gap-1.5">
								<span
									class={`h-2.5 w-2.5 shrink-0 rounded-full ${primaryMeta.dotClass}`}
									aria-hidden="true"
								></span>
								<input
									class="path-name-input input-studio min-w-0 flex-1 !border-0 !bg-transparent !px-0 !py-0 text-body-text font-bold text-near-black focus:!ring-0"
									value={feature.properties?.name || ''}
									placeholder={$_('editor.unnamed_path')}
									aria-label={$_('editor.path_name')}
									onclick={(event) => event.stopPropagation()}
									onchange={(event) => {
										onUpdateRoutePathFeature(document.path, feature.id, {
											name: event.currentTarget.value
										});
									}}
								/>
								<span class="inline-flex shrink-0 items-center gap-0.5">
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

							<div
								class="space-y-1.5"
								onclick={(event) => event.stopPropagation()}
								role="presentation"
							>
								{#if topoEntries.length > 1}
									<div class="text-[10px] font-medium text-warm-gray-400">{document.name}</div>
								{/if}
								{#if assignments.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each assignments as { route, ref }}
											{@const meta = getRoutePathRoleMeta(ref.role)}
											<span
												class="inline-flex max-w-full items-center gap-1 rounded-sm border border-black/10 bg-warm-white px-1.5 py-0.5 text-[10px]"
											>
												<span class="truncate font-semibold text-near-black">
													{route.name || route.id}
												</span>
												<button
													type="button"
													class={`shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-bold leading-none transition-none ${meta.badgeClass}`}
													title={$_('editor.click_role_to_change')}
													onclick={() =>
														onUpdateRoutePath(document.path, route.id, feature.id, {
															role: nextRoutePathRole(ref.role)
														})}
												>
													{$_(meta.shortLabelKey)}
												</button>
												<button
													type="button"
													class="ml-0.5 shrink-0 text-warm-gray-400 hover:text-rose-600"
													title={$_('editor.unassign_path')}
													aria-label={$_('editor.unassign_path')}
													onclick={() => onRemoveRoutePath(document.path, route.id, feature.id)}
												>
													<i class="fa-solid fa-xmark text-[9px]"></i>
												</button>
											</span>
										{/each}
									</div>
								{:else}
									<div class="flex items-center justify-between gap-2">
										<span class="text-micro-data text-warm-gray-400">
											{$_('editor.not_assigned_to_a_route')}
										</span>
										<button
											type="button"
											class="shrink-0 rounded-sm border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 hover:bg-teal-100"
											onclick={() =>
												onMoveTopoPathToCragApproach(document.path, feature.id, pathIndex)}
										>
											{$_('editor.use_for_whole_crag')}
										</button>
									</div>
								{/if}
								{#if unassigned.length > 0}
									<div class="flex items-center gap-1">
										<select
											class="input-studio min-w-0 flex-1 bg-white text-[11px]"
											aria-label={$_('editor.assign_route')}
											onchange={(event) => {
												const routeId = event.currentTarget.value;
												if (routeId) {
													onAssignExistingRoutePath(
														document.path,
														routeId,
														feature.id,
														defaultAssignRole,
														''
													);
												}
												event.currentTarget.value = '';
											}}
										>
											<option value="" selected>+ {$_('editor.assign_route')}</option>
											{#each unassigned as route}
												<option value={route.id}>
													{route.name || $_('editor.unnamed_route')}{route.grade
														? ` (${route.grade})`
														: ''}
												</option>
											{/each}
										</select>
										{#if (document.data?.routes?.length || 0) > 1}
											<button
												type="button"
												class="shrink-0 rounded-sm border border-black/15 bg-white px-2 py-1 text-[10px] font-bold text-creator-blue hover:bg-creator-blue/5"
												title={$_('editor.assign_to_all_routes')}
												onclick={() =>
													onAssignPathToAllRoutes(document.path, feature.id, defaultAssignRole)}
											>
												{$_('editor.assign_all_routes')}
											</button>
										{/if}
									</div>
								{/if}
							</div>

							<div
								class="border-t border-black/5 pt-1.5"
								onclick={(event) => event.stopPropagation()}
								role="presentation"
							>
								<details>
									<summary
										class="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-warm-gray-400 hover:text-near-black"
									>
										<i class="fa-solid fa-chevron-right details-arrow text-[8px]" aria-hidden="true"
										></i>
										<span class="truncate">
											{#if feature.properties?.description}
												{feature.properties.description}
											{:else}
												{$_('editor.path_details')}
											{/if}
										</span>
									</summary>
									<div class="mt-1.5 space-y-1.5">
										<textarea
											id={`path-description-${document.path}-${feature.id}`}
											class="input-studio w-full resize-none bg-white"
											rows="2"
											value={feature.properties?.description || ''}
											placeholder={$_('editor.example_path')}
											aria-label={$_('editor.path_text')}
											oninput={(event) =>
												onUpdateRoutePathFeature(document.path, feature.id, {
													description: event.currentTarget.value
												})}
										></textarea>
										{#if assignableAccessFeatures.length > 0}
											<select
												class="input-studio w-full bg-white"
												aria-label={$_('editor.assign_access_feature')}
												value={feature.properties?.accessFeatureId || ''}
												onchange={(event) =>
													onUpdateRoutePathFeature(document.path, feature.id, {
														accessFeatureId: event.currentTarget.value
													})}
											>
												<option value="">{$_('editor.no_access_feature')}</option>
												{#each assignableAccessFeatures as accessFeature}
													<option value={accessFeature.id}
														>{accessFeatureLabel(accessFeature)}</option
													>
												{/each}
											</select>
										{/if}
									</div>
								</details>
							</div>
						</div>
					{/each}
				{/each}
			</div>
		{:else if accessPointCount > 0}
			<p class="text-micro-data text-warm-gray-400">{$_('editor.no_paths_yet')}</p>
		{/if}
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

	details[open] .details-arrow {
		transform: rotate(90deg);
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>

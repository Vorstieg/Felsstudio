<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { PathFeature, Route } from '@vorstieg/fels-types/types';
	import type { RouteEntry } from './crag-route-types.ts';
	import PitchComponent from '$lib/components/editor/topo-properties/routes/PitchComponent.svelte';
	import { createVariant } from '$lib/components/editor/topo-properties/topo-properties-utils.ts';
	import { convertRouteType } from '$lib/assets/js/topo-utils.ts';
	import { generateId } from '$lib/assets/js/id-utils.ts';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import {
		ROUTE_PATH_ROLES,
		getRoutePathRoleMeta,
		inferRoutePathRole,
		type RoutePathRole
	} from './route-path-roles.ts';

	type EditableRoute = Route;
	type ModalPathFeature = PathFeature & {
		properties?: { name?: string; [key: string]: unknown };
	};
	type AccessFeature = {
		id?: string | number;
		properties?: { kind?: string; name?: string };
		geometry?: { coordinates?: number[][] };
	};
	type Props = { routeEntry?: RouteEntry | null; onClose?: () => void };

	const cragEditorState = getCragEditorSession();
	const { routeTool } = getCragEditorTools();
	const {
		updateRoute: onUpdateRoute,
		addRoutePath: onAddRoutePath,
		assignExistingRoutePath: onAssignExistingRoutePath,
		createRoutePathFromAccess: onCreateRoutePathFromAccess,
		editRoutePath: onEditRoutePath,
		duplicateRoutePath: onDuplicateRoutePath,
		updateRoutePath: onUpdateRoutePath,
		removeRoutePath: onRemoveRoutePath,
		deleteRoutePath: onDeleteRoutePath
	} = routeTool;
	let accessFeatures = $derived(
		(cragEditorState.getWorkspaceAccess()?.features || []) as AccessFeature[]
	);

	let { routeEntry = null, onClose = () => {} }: Props = $props();

	let route = $derived(routeEntry?.route ?? null);
	let document = $derived(routeEntry?.document ?? null);
	let documentDisplayName = $derived(
		document?.node?.entry?.properties?.name ||
			document?.data?.name ||
			document?.path.split('/').at(-1) ||
			''
	);
	let attachSelection = $state('');
	let attachRole = $state<RoutePathRole>('approach');

	$effect(() => {
		void document?.path;
		void route?.id;
		attachSelection = '';
		attachRole = 'approach';
	});

	function paths() {
		return (route?.pathRefs || []).map((ref) => ({
			...ref,
			feature: document?.data?.paths?.features?.find(
				(item) => String(item.id) === String(ref.pathId)
			) as ModalPathFeature | undefined
		}));
	}
	function availablePaths(): ModalPathFeature[] {
		const assigned = new Set((route?.pathRefs || []).map((ref) => String(ref.pathId)));
		return (document?.data?.paths?.features || []).filter(
			(feature) => !assigned.has(String(feature.id))
		) as ModalPathFeature[];
	}
	function availableAccessPaths(): AccessFeature[] {
		return accessFeatures.filter(
			(feature) =>
				feature.properties?.kind === 'approach' && (feature.geometry?.coordinates?.length ?? 0) > 1
		);
	}

	function handleAttachSelectionChange(value: string): void {
		attachSelection = value;
		if (value.startsWith('topo::')) {
			const pathId = value.slice('topo::'.length);
			const feature = availablePaths().find((item) => String(item.id) === pathId);
			attachRole = inferRoutePathRole(feature?.properties?.name, 'main');
		} else if (value.startsWith('access::')) {
			const accessId = value.slice('access::'.length);
			const feature = availableAccessPaths().find((item) => String(item.id) === accessId);
			attachRole = inferRoutePathRole(feature?.properties?.name, 'approach');
		}
	}

	function attachSelectedPath(): void {
		if (!document || !route || !attachSelection) return;
		if (attachSelection.startsWith('topo::')) {
			const pathId = attachSelection.slice('topo::'.length);
			onAssignExistingRoutePath(document.path, route.id, pathId, attachRole, '');
		} else if (attachSelection.startsWith('access::')) {
			const accessId = attachSelection.slice('access::'.length);
			onCreateRoutePathFromAccess(document.path, route.id, accessId, attachRole);
		}
		attachSelection = '';
	}

	function effectiveNote(label: string | undefined, pathName: string | undefined): string {
		const trimmed = String(label || '').trim();
		if (!trimmed) return '';
		if (pathName && trimmed === String(pathName).trim()) return '';
		return trimmed;
	}

	function addPitch(): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			pitches: [
				...(route.pitches || []),
				{
					id: generateId('pitch'),
					pitchNumber: (route.pitches?.length || 0) + 1,
					points: [],
					grade: null,
					lineStyle: '',
					type: 'pitch'
				}
			]
		});
	}

	function removePitch(index: number): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			pitches: (route.pitches || []).filter((_, pitchIndex) => pitchIndex !== index)
		});
	}

	function addVariant(): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			variants: [
				...(route.variants || []),
				createVariant({ ...route, variants: route.variants || [] })
			]
		});
	}

	function removeVariant(index: number): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			variants: (route.variants || []).filter((_, variantIndex) => variantIndex !== index)
		});
	}

	function updatePitch(index: number, field: string, value: unknown): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			pitches: (route.pitches || []).map((pitch, pitchIndex) =>
				pitchIndex === index ? { ...pitch, [field]: value } : pitch
			)
		});
	}

	function updateVariant(index: number, field: string, value: unknown): void {
		if (!document || !route) return;
		onUpdateRoute(document.path, route.id, {
			variants: (route.variants || []).map((variant, variantIndex) =>
				variantIndex === index ? { ...variant, [field]: value } : variant
			)
		});
	}

	function updateRouteField(field: string, value: unknown): void {
		if (!document || !route) return;
		if (field === 'grade')
			onUpdateRoute(document.path, route.id, { grade: value as Route['grade'] });
		else if (field === 'length') {
			const parsed = value === '' || value == null ? undefined : Number(value);
			onUpdateRoute(document.path, route.id, {
				length: parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
			});
		} else if (field === 'boltAmount') {
			const parsed = value === '' || value == null ? undefined : Number(value);
			onUpdateRoute(document.path, route.id, {
				boltAmount: parsed != null && Number.isFinite(parsed) ? parsed : undefined
			});
		} else if (field === 'lineStyle')
			onUpdateRoute(document.path, route.id, { lineStyle: String(value) });
	}

	function hasRouteType(route: EditableRoute, type: string): boolean {
		return Array.isArray(route.type) ? route.type.includes(type) : route.type === type;
	}

	function updateRouteType(value: string): void {
		if (!document || !route) return;
		cragEditorState.updateRoute(document.path, route.id, (current) =>
			convertRouteType(current, value)
		);
	}
</script>

{#if route && document}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
		role="presentation"
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default"
			aria-label={$_('editor.close_route_details')}
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
					{route.name || $_('editor.route_details')}
				</h2>
				<button
					type="button"
					class="text-warm-gray-400 hover:text-near-black"
					onclick={onClose}
					aria-label={$_('editor.close_route_details')}
				>
					<i class="fa-solid fa-xmark"></i>
				</button>
			</header>

			<div class="space-y-4 overflow-y-auto p-4">
				<div class="grid grid-cols-[1fr_7rem] gap-2">
					<div>
						<label class="text-ui-label block" for="route-name">{$_('editor.route_name')}</label>
						<input
							id="route-name"
							class="input-studio w-full"
							value={route.name || ''}
							oninput={(event) =>
								onUpdateRoute(document.path, route.id, { name: event.currentTarget.value })}
							placeholder={$_('editor.route_name')}
						/>
					</div>
					<div>
						<label class="text-ui-label block" for="route-type">{$_('editor.type')}</label>
						<select
							id="route-type"
							class="input-studio w-full"
							value={Array.isArray(route.type) ? route.type[0] : route.type || ''}
							onchange={(event) => updateRouteType(event.currentTarget.value)}
						>
							<option value="sports-climbing">{$_('types.sports-climbing')}</option>
							<option value="bouldering">{$_('types.bouldering')}</option>
							<option value="trad">{$_('editor.trad')}</option>
							<option value="multi-pitch">{$_('editor.multipitch')}</option>
							<option value="alpine-tour">{$_('types.alpine-tour')}</option>
							<option value="via-ferrata">{$_('types.via-ferrata')}</option>
						</select>
					</div>
				</div>

				{#if hasRouteType(route, 'multi-pitch')}
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-ui-label">{$_('editor.pitches')}</span>
							<button
								type="button"
								class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue"
								onclick={addPitch}>{$_('editor.add_add')}</button
							>
						</div>
						{#each route.pitches || [] as pitch, index}
							<PitchComponent
								{pitch}
								kind="pitch"
								{index}
								topoScale={1}
								fixPoints={[]}
								onRemove={(_, index) => removePitch(index)}
								onFieldChange={(field, value) => updatePitch(index, field, value)}
							/>
						{/each}

						<div class="space-y-2 border-t border-black/10 pt-2">
							<div class="flex items-center justify-between">
								<span class="text-ui-label">{$_('editor.variants')}</span>
								<button
									type="button"
									class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue"
									onclick={addVariant}>{$_('editor.add_add')}</button
								>
							</div>
							{#each route.variants || [] as variant, index}
								<PitchComponent
									pitch={variant}
									kind="variant"
									{index}
									topoScale={1}
									fixPoints={[]}
									onRemove={(_, index) => removeVariant(index)}
									onFieldChange={(field, value) => updateVariant(index, field, value)}
								/>
							{/each}
						</div>
					</div>
				{:else}
					<PitchComponent
						pitch={route}
						kind="single"
						topoScale={1}
						fixPoints={[]}
						onFieldChange={updateRouteField}
					/>
				{/if}

				<div>
					<label class="text-ui-label block" for="route-description"
						>{$_('editor.description')}</label
					>
					<textarea
						id="route-description"
						class="input-studio w-full resize-none"
						rows="3"
						value={route.description || ''}
						oninput={(event) =>
							onUpdateRoute(document.path, route.id, { description: event.currentTarget.value })}
						placeholder={$_('editor.description')}
					></textarea>
				</div>

				<div class="space-y-2 border-t border-black/10 pt-3">
					<div class="flex items-center justify-between gap-2">
						<span class="text-ui-label">{$_('editor.paths')}</span>
						<button
							type="button"
							class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue hover:bg-creator-blue/5"
							onclick={() => onAddRoutePath(document.path, route.id)}
						>
							<i class="fa-solid fa-plus mr-1"></i>{$_('editor.add_path')}
						</button>
					</div>
					{#if availablePaths().length > 0 || availableAccessPaths().length > 0}
						<div class="grid grid-cols-[1fr_7.5rem_auto] items-center gap-1.5">
							<select
								class="input-studio min-w-0"
								aria-label={$_('editor.attach_path_to_route')}
								value={attachSelection}
								onchange={(event) => handleAttachSelectionChange(event.currentTarget.value)}
							>
								<option value="">{$_('editor.attach_path_to_route')}</option>
								{#each availablePaths() as feature}
									<option value={`topo::${feature.id}`}>
										{feature.properties?.name || feature.id}
									</option>
								{/each}
								{#each availableAccessPaths() as feature}
									<option value={`access::${feature.id}`}>
										{feature.properties?.name || feature.id} · {$_('editor.whole_crag')}
									</option>
								{/each}
							</select>
							<select
								class="input-studio min-w-0"
								aria-label={$_('editor.path_role')}
								bind:value={attachRole}
							>
								{#each ROUTE_PATH_ROLES as roleMeta}
									<option value={roleMeta.id}>{$_(roleMeta.labelKey)}</option>
								{/each}
							</select>
							<button
								type="button"
								class="rounded-sm bg-creator-blue px-2.5 py-1.5 text-micro-data font-bold text-white hover:bg-creator-blue-active disabled:cursor-not-allowed disabled:opacity-40"
								disabled={!attachSelection}
								onclick={attachSelectedPath}
							>
								{$_('editor.add')}
							</button>
						</div>
					{/if}
					{#if paths().length === 0}
						<p class="text-micro-data text-warm-gray-500">{$_('editor.no_paths_attached')}</p>
					{:else}
						<div class="space-y-1.5">
							{#each paths() as pathAsset}
								{@const roleMeta = getRoutePathRoleMeta(pathAsset.role)}
								{@const pathDisplayName = pathAsset.feature?.properties?.name || pathAsset.pathId}
								<div class="space-y-1.5 rounded-sm border border-black/10 bg-warm-white/40 p-2">
									<div class="flex items-center gap-2">
										<span
											class={`h-2.5 w-2.5 shrink-0 rounded-full ${roleMeta.dotClass}`}
											aria-hidden="true"
										></span>
										<select
											class={`shrink-0 rounded-sm border px-1.5 py-1 text-[11px] font-semibold leading-tight focus:outline-none ${roleMeta.badgeClass}`}
											aria-label={$_('editor.path_role')}
											value={roleMeta.id}
											onchange={(event) =>
												onUpdateRoutePath(document.path, route.id, pathAsset.pathId, {
													role: event.currentTarget.value
												})}
										>
											{#each ROUTE_PATH_ROLES as option}
												<option value={option.id} class="bg-white text-near-black"
													>{$_(option.labelKey)}</option
												>
											{/each}
										</select>
										<span
											class="min-w-0 flex-1 truncate text-xs font-bold text-near-black"
											title={String(pathDisplayName)}
										>
											{pathDisplayName}
										</span>
										<div class="inline-flex shrink-0 items-center gap-0.5">
											<button
												type="button"
												class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-creator-blue"
												title={$_('editor.edit_path')}
												aria-label={$_('editor.edit_path')}
												onclick={() => onEditRoutePath(document.path, route.id, pathAsset.pathId)}
												><i class="fa-solid fa-pencil text-[10px]"></i></button
											>
											<button
												type="button"
												class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-creator-blue"
												title={$_('editor.duplicate_path')}
												aria-label={$_('editor.duplicate_path')}
												onclick={() => onDuplicateRoutePath(document.path, pathAsset.pathId)}
												><i class="fa-solid fa-copy text-[10px]"></i></button
											>
											<button
												type="button"
												class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-warm-gray-400 hover:bg-rose-50 hover:text-rose-600"
												title={$_('editor.unassign_path')}
												aria-label={$_('editor.unassign_path')}
												onclick={() => onRemoveRoutePath(document.path, route.id, pathAsset.pathId)}
												><i class="fa-solid fa-xmark text-[11px]"></i></button
											>
											<button
												type="button"
												class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-warm-gray-400 hover:bg-rose-50 hover:text-rose-600"
												title={$_('editor.delete_shared_path')}
												aria-label={$_('editor.delete_shared_path')}
												onclick={() => onDeleteRoutePath(document.path, pathAsset.pathId)}
												><i class="fa-solid fa-trash-can text-[10px]"></i></button
											>
										</div>
									</div>
									<input
										class="input-studio w-full bg-white text-[11px]"
										value={effectiveNote(pathAsset.label, pathAsset.feature?.properties?.name)}
										aria-label={$_('editor.label')}
										placeholder={$_('editor.optional_route_note')}
										onchange={(event) =>
											onUpdateRoutePath(document.path, route.id, pathAsset.pathId, {
												label: event.currentTarget.value
											})}
									/>
								</div>
							{/each}
						</div>
					{/if}
					<p class="text-micro-data text-warm-gray-400">
						{$_('editor.stored_in')}
						{documentDisplayName}
					</p>
				</div>
			</div>
		</dialog>
	</div>
{/if}

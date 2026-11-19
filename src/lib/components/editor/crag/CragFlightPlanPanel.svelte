<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { PointOrAreaGeometry } from '@vorstieg/fels-types/types';
	import { onDestroy } from 'svelte';
	import { generateFlightPlanInWorker } from '$lib/assets/js/flight-plan-client.ts';
	import { downloadFlightPlanKmz } from '$lib/assets/js/flight-plan-kml.ts';
	import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';

	type Detail = 'standard' | 'high' | 'topo';
	type FlightPattern = 'facade-grid' | 'constant-distance-grid' | 'half-helix' | 'curved-sweep';
	type PolygonEntry = {
		id?: string;
		name?: string;
		geometry?: PointOrAreaGeometry | null;
	};
	let {
		entry,
		plan = $bindable(null),
		entryName = '',
		onPlanGenerated = () => {}
	}: {
		entry?: PolygonEntry | null;
		plan?: FlightPlan | null;
		entryName?: string;
		onPlanGenerated?: (_plan: FlightPlan | null) => void;
	} = $props();

	let detail = $state<Detail>('topo');
	let pattern = $state<FlightPattern>('facade-grid');
	let minimumWallDistanceMeters = $state(2);
	let error = $state('');
	let generating = $state(false);
	let progress = $state('');
	let generationGeometry = $state('');
	$effect(() => {
		if (generating && JSON.stringify(entry?.geometry) !== generationGeometry) cancelGeneration();
	});
	let generation: AbortController | null = null;
	onDestroy(() => {
		generation?.abort();
		generation = null;
	});

	function cancelGeneration() {
		generation?.abort();
		generation = null;
		generating = false;
		progress = '';
	}
	let cameraPreviewWaypointIndex = $derived(plan?.previewWaypointIndex ?? null);
	let previewWaypoint = $derived(
		plan?.waypoints.find((waypoint) => waypoint.index === cameraPreviewWaypointIndex)
	);
	let coverageBlocked = $derived(
		plan?.metadata.coverageStatus === 'partial' || plan?.metadata.coverageStatus === 'unresolved'
	);
	let transitWaypointCount = $derived(
		plan?.waypoints.filter((waypoint) => waypoint.phase === 'transit').length ?? 0
	);
	let rowStarts = $derived(
		plan?.waypoints?.filter(
			(waypoint) => waypoint.rowBoundary === 'start' || waypoint.rowBoundary === 'single'
		) || []
	);

	async function generate() {
		cancelGeneration();
		const controller = new AbortController();
		generation = controller;
		const geometryKey = JSON.stringify(entry?.geometry) ?? '';
		generationGeometry = geometryKey;
		generating = true;
		error = '';
		try {
			const presets: Record<Detail, { targetGsdCm: number }> = {
				standard: { targetGsdCm: 1 },
				high: { targetGsdCm: 0.7 },
				topo: { targetGsdCm: 0.5 }
			};
			const wallDistance = Number(minimumWallDistanceMeters);
			if (!Number.isFinite(wallDistance) || wallDistance < 1) {
				throw new Error($_('editor.minimum_wall_distance_must_be_at_least_1_m'));
			}

			const geometry = entry?.geometry?.type === 'Polygon' ? entry.geometry : null;
			const polygon: import('geojson').Polygon | null = geometry
				? {
						type: 'Polygon',
						coordinates: geometry.coordinates.map((ring) =>
							ring.map((position) => {
								const longitude = position[0];
								const latitude = position[1];
								if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
									throw new Error($_('editor.entry_geometry_contains_an_invalid_coordinate'));
								}
								return [longitude, latitude];
							})
						)
					}
				: null;
			if (!polygon) throw new Error($_('editor.select_a_polygon_capture_area_first'));
			const generatedPlan = await generateFlightPlanInWorker(
				polygon,
				{
					...presets[detail],
					pattern,
					standOffMeters: wallDistance,
					minimumFaceDistanceMeters: wallDistance,
					cragName: entryName,
					startElevation: plan?.metadata.startElevation,
					name: `${entry?.name || entry?.id || entryName || $_('editor.entry')} capture plan`
				},
				{
					signal: controller.signal,
					onProgress: (message) => {
						if (generation === controller) progress = message;
					}
				}
			);

			if (generation !== controller || JSON.stringify(entry?.geometry) !== geometryKey) return;
			plan = generatedPlan;
			onPlanGenerated(generatedPlan);
		} catch (generationError) {
			if (
				generation !== controller ||
				controller.signal.aborted ||
				JSON.stringify(entry?.geometry) !== geometryKey
			)
				return;
			plan = null;
			onPlanGenerated(null);
			error =
				generationError instanceof Error
					? generationError.message
					: $_('editor.unable_to_generate_a_flight_plan');
		} finally {
			if (generation === controller) {
				generating = false;
				generation = null;
				progress = '';
			}
		}
	}

	async function download() {
		if (!plan) return;
		error = '';
		try {
			const launchElevation = plan.metadata.startElevation;
			if (typeof launchElevation !== 'number' || !Number.isFinite(launchElevation)) {
				throw new Error($_('editor.launch_elevation_required'));
			}
			await downloadFlightPlanKmz(plan);
		} catch (downloadError) {
			error =
				downloadError instanceof Error
					? downloadError.message
					: $_('editor.unable_to_download_the_capture_plan');
		}
	}

	function setLaunchElevation(event: Event & { currentTarget: HTMLInputElement }) {
		if (!plan) return;
		const elevation = event.currentTarget.valueAsNumber;
		plan = {
			...plan,
			metadata: {
				...plan.metadata,
				startElevation: Number.isFinite(elevation) ? elevation : undefined
			}
		};
		error = '';
		onPlanGenerated(plan);
	}

	function deleteFlightPath() {
		cancelGeneration();
		plan = null;
		error = '';
		onPlanGenerated(null);
	}

	function selectCameraPreview(event: Event & { currentTarget: HTMLSelectElement }) {
		if (!plan) return;
		const value = event.currentTarget.value;
		const previewWaypointIndex = value === '' ? null : Number(value);
		plan = { ...plan, previewWaypointIndex };
		onPlanGenerated(plan);
	}

	let isPolygon = $derived(entry?.geometry?.type === 'Polygon');
</script>

<section class="space-y-2 border-t border-black/15 pt-3">
	<div class="flex items-center gap-2">
		<div
			class="flex h-6 w-6 items-center justify-center rounded-sm bg-creator-blue/10 text-creator-blue"
		>
			<i class="fa-solid fa-helicopter text-[10px]"></i>
		</div>
		<div>
			<h3 class="text-ui-label text-near-black !m-0">{$_('editor.drone_capture_plan')}</h3>
			<p class="text-[10px] text-warm-gray-400">
				{$_('editor.one_native_mavic_4_pro_fa_ade_mission')}
			</p>
		</div>
	</div>

	{#if !isPolygon}
		<p class="rounded-sm border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
			{$_('editor.capture_polygon_required')}
		</p>
	{:else}
		<label class="block text-ui-label text-warm-gray-500">
			{$_('editor.detail')}
			<select
				bind:value={detail}
				disabled={generating}
				class="input-studio mt-0.5 w-full appearance-none"
			>
				<option value="standard">{$_('editor.standard')}</option>
				<option value="high">{$_('editor.high_detail')}</option>
				<option value="topo">{$_('editor.topo_detail')}</option>
			</select>
		</label>
		<label class="block text-ui-label text-warm-gray-500">
			{$_('editor.pattern')}
			<select
				bind:value={pattern}
				disabled={generating}
				class="input-studio mt-0.5 w-full appearance-none"
			>
				<option value="facade-grid">{$_('editor.fa_ade_grid')}</option>
				<option value="constant-distance-grid">{$_('editor.constant_distance_grid')}</option>
				<option value="half-helix">{$_('editor.half_helix')}</option>
				<option value="curved-sweep">{$_('editor.curved_sweep')}</option>
			</select>
		</label>
		<label class="block text-ui-label text-warm-gray-500">
			{$_('editor.minimum_wall_distance_m')}
			<input
				type="number"
				min="1"
				step="0.5"
				bind:value={minimumWallDistanceMeters}
				disabled={generating}
				class="input-studio mt-0.5 w-full"
			/>
		</label>
		<p class="text-[9px] leading-snug text-warm-gray-500">
			{$_('editor.capture_detail_hint')}
		</p>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-creator-blue px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-creator-blue/90"
			onclick={generate}
			disabled={generating}
		>
			<i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
			{$_('editor.generate_plan')}
		</button>
	{/if}

	{#if generating}
		<div class="flex items-center justify-between gap-2 text-[10px]">
			<span role="status">{progress || $_('editor.starting_flight_calculation')}</span>
			<button type="button" onclick={cancelGeneration} class="text-warm-gray-600 underline"
				>{$_('editor.cancel')}</button
			>
		</div>
	{/if}

	{#if error}
		<p class="rounded-sm border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700">
			{error}
		</p>
	{/if}

	{#if plan}
		<section
			aria-label={$_('editor.capture_plan_legend')}
			class="rounded-sm border border-black/15 bg-white p-2 text-[10px] text-warm-gray-600"
		>
			<h4 class="!m-0 mb-2 font-semibold text-near-black">{$_('editor.map_legend')}</h4>
			<ul class="!m-0 grid list-none grid-cols-2 gap-x-3 gap-y-2 !p-0">
				{#each [{ color: '#f59e0b', label: $_('editor.capture_waypoint'), shape: 'dot' }, { color: '#0aa6eb', label: $_('editor.transit_waypoint'), shape: 'dot' }, { color: '#16a34a', label: $_('editor.row_start_single_point'), shape: 'dot' }, { color: '#ef4444', label: $_('editor.row_end'), shape: 'dot' }, { color: '#a855f7', label: $_('editor.detected_wall_base'), shape: 'line' }, { color: '#38bdf8', label: $_('editor.detected_wall_top'), shape: 'dashed' }, { color: '#facc15', label: $_('editor.wall_sample'), shape: 'dot' }, { color: '#facc15', label: $_('editor.camera_field_of_view'), shape: 'line' }, { color: '#94a3b8', label: $_('editor.ground_shadow_height_guides'), shape: 'line' }] as item}
					<li class="flex items-center gap-2 leading-snug">
						<span class="flex w-5 shrink-0 justify-center" aria-hidden="true">
							<span
								class={item.shape === 'dot' ? 'h-2.5 w-2.5 rounded-full' : 'w-5 border-t-2'}
								style:background-color={item.shape === 'dot' ? item.color : undefined}
								style:border-color={item.color}
								style:border-top-style={item.shape === 'dashed' ? 'dashed' : undefined}
							></span>
						</span>
						{item.label}
					</li>
				{/each}
			</ul>
			<p class="mb-0 mt-2 text-[9px] text-warm-gray-500">
				{$_('editor.flight_segment_colors')}
			</p>
		</section>
		<div
			class="rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2 text-[10px] text-warm-gray-600"
		>
			<div class="grid grid-cols-2 gap-x-2 gap-y-1">
				<span>{$_('editor.pattern')}</span><strong class="text-right capitalize text-near-black"
					>{plan.metadata.pattern}</strong
				>
				<span>{$_('editor.coverage_grids')}</span><strong class="text-right text-near-black"
					>{plan.metadata.coveragePasses ?? 1}</strong
				>
				{#if plan.metadata.supplementaryWaypointCount !== undefined}
					<span>{$_('editor.supplementary_views')}</span><strong class="text-right text-near-black"
						>{plan.metadata.supplementaryWaypointCount}</strong
					>
				{/if}
				<span>{$_('editor.waypoints')}</span><strong class="text-right text-near-black"
					>{plan.waypoints.length}</strong
				>
				{#if transitWaypointCount > 0}
					<span>{$_('editor.transit_waypoints')}</span><strong class="text-right text-near-black"
						>{transitWaypointCount}</strong
					>
				{/if}
				<span>{$_('editor.detected_wall')}</span>
				<strong class="text-right text-near-black">
					{plan.wallDetection.coordinates.length > 1
						? `${Math.round(plan.wallDetection.confidence * 100)}% confidence`
						: $_('editor.not_detected')}
				</strong>
				<span>{$_('editor.wall_shape')}</span>
				<strong class="text-right capitalize text-near-black">
					{plan.wallDetection.coordinates.length > 1
						? $_('editor.shape_' + plan.wallDetection.shape)
						: $_('editor.unknown')}
				</strong>
				<span>{$_('editor.vertex_elevation_min')}</span><strong class="text-right text-near-black"
					>{plan.metadata.sectorMinimumElevation.toFixed(1)} m</strong
				>
				<span>{$_('editor.vertex_elevation_max')}</span><strong class="text-right text-near-black"
					>{plan.metadata.sectorMaximumElevation.toFixed(1)} m</strong
				>
				<span>{$_('editor.capture_height')}</span><strong class="text-right text-near-black"
					>{plan.metadata.captureHeightMeters.toFixed(1)} m</strong
				>
				<span>{$_('editor.target_detail')}</span><strong class="text-right text-near-black"
					>{plan.metadata.targetGsdCm} cm/pixel</strong
				>
				<span>{$_('editor.planned_stand_off')}</span><strong class="text-right text-near-black"
					>{plan.metadata.standOffMeters?.toFixed(1)} m</strong
				>
				<span>{$_('editor.camera')}</span><strong class="text-right text-near-black"
					>{plan.metadata.camera}</strong
				>
				<span>{$_('editor.photos')}</span><strong class="text-right text-near-black"
					>{plan.metadata.photoCount}</strong
				>
				{#if plan.metadata.coverageTargetCount !== undefined}
					<span>{$_('editor.coverage_samples')}</span><strong class="text-right text-near-black"
						>{plan.metadata.coveredTargetCount}/{plan.metadata.coverageTargetCount}</strong
					>
					<span>{$_('editor.top_coverage_samples')}</span><strong class="text-right text-near-black"
						>{plan.metadata.coveredCrestTargetCount}/{plan.metadata.crestTargetCount}</strong
					>
					<span>{$_('editor.tele_detail_photos')}</span><strong class="text-right text-near-black"
						>{plan.metadata.detailPhotoCount ?? 0}</strong
					>
				{/if}
				<span>{$_('editor.cliff_clearance')}</span>
				<strong class="text-right text-near-black">
					≥ {plan.metadata.minimumFaceDistanceMeters.toFixed(1)} m
				</strong>
				{#if typeof plan.metadata.clearanceMarginMeters === 'number'}
					<span>{$_('editor.planning_margin')}</span><strong class="text-right text-near-black"
						>+ {plan.metadata.clearanceMarginMeters.toFixed(1)} m</strong
					>
				{/if}
				<span>{$_('editor.ground_clearance')}</span>
				<strong class="text-right text-near-black">
					≥ {plan.metadata.minimumGroundClearanceMeters.toFixed(1)} m
				</strong>
				{#if plan.metadata.droppedWaypointCount > 0}
					<span>{$_('editor.waypoints_removed')}</span>
					<strong class="text-right text-near-black">{plan.metadata.droppedWaypointCount}</strong>
				{/if}
				{#if plan.metadata.altitudeCappedWaypointCount > 0}
					<span>{$_('editor.above_height_cap_removed')}</span>
					<strong class="text-right text-near-black"
						>{plan.metadata.altitudeCappedWaypointCount}</strong
					>
				{/if}
				{#if plan.metadata.fragmentedRowCount > 0}
					<span>{$_('editor.rows_replanned')}</span>
					<strong class="text-right text-near-black">{plan.metadata.fragmentedRowCount}</strong>
				{/if}
				{#if plan.metadata.discardedFragmentWaypointCount > 0}
					<span>{$_('editor.disconnected_points_removed')}</span>
					<strong class="text-right text-near-black"
						>{plan.metadata.discardedFragmentWaypointCount}</strong
					>
				{/if}
			</div>
			{#if coverageBlocked}
				<p
					role="alert"
					class="mt-2 rounded-sm border border-amber-200 bg-amber-50 p-2 text-amber-800"
				>
					{$_('editor.capture_coverage_warning')}
				</p>
			{/if}
			<p class="mt-2 text-[9px] leading-snug text-warm-gray-500">
				{$_('editor.capture_coverage_hint')}
			</p>
			<label class="mt-2 block text-ui-label text-warm-gray-500">
				{$_('editor.camera_view')}
				<select
					value={cameraPreviewWaypointIndex ?? ''}
					onchange={selectCameraPreview}
					class="input-studio mt-0.5 w-full appearance-none"
				>
					<option value="">{$_('editor.off')}</option>
					{#each rowStarts as waypoint, row}
						<option value={waypoint.index}
							>{$_('editor.row')}
							{row + 1}{waypoint.captureView === 'crest'
								? ' · ' + $_('editor.top_edge')
								: ''}</option
						>
					{/each}
				</select>
			</label>
			{#if previewWaypoint}
				<p class="mt-1 text-[9px] text-warm-gray-500">
					{$_('editor.pitch')}
					{previewWaypoint.gimbalPitch?.toFixed(1)}° · {previewWaypoint.camera}{previewWaypoint.detailCamera
						? ` + ${previewWaypoint.detailCamera} detail`
						: ''}
				</p>
			{/if}
			<label class="mt-2 block text-ui-label text-warm-gray-500">
				{$_('editor.launch_elevation_m_amsl')}
				<input
					type="number"
					step="0.1"
					value={plan.metadata.startElevation ?? ''}
					oninput={setLaunchElevation}
					disabled={generating}
					class="input-studio mt-0.5 w-full"
				/>
			</label>
			<p class="mt-1 text-[9px] leading-snug text-warm-gray-500">
				{$_('editor.launch_elevation_hint')}
			</p>
			<button
				type="button"
				class="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-creator-blue/30 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-creator-blue hover:bg-creator-blue/5"
				onclick={download}
				disabled={generating || coverageBlocked}
			>
				<i class="fa-solid fa-download text-xs"></i>
				{$_('editor.download_mavic_4_pro_kmz')}
			</button>
			<button
				type="button"
				class="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-sm border border-rose-200 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:bg-rose-50"
				onclick={deleteFlightPath}
			>
				<i class="fa-solid fa-trash-can text-xs"></i>
				{$_('editor.delete_flight_path')}
			</button>
			<p class="mt-1.5 text-[9px] leading-snug text-warm-gray-500">
				{$_('editor.flight_map_preview_hint')}
			</p>
		</div>
	{/if}
</section>

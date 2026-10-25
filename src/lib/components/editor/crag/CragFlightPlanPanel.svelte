<script lang="ts">
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
			const presets: Record<
				Detail,
				{ targetGsdCm: number; stripSpacingMeters: number; pointSpacingMeters: number }
			> = {
				standard: { targetGsdCm: 1, stripSpacingMeters: 14, pointSpacingMeters: 7 },
				high: { targetGsdCm: 0.7, stripSpacingMeters: 12, pointSpacingMeters: 6 },
				topo: { targetGsdCm: 0.5, stripSpacingMeters: 10, pointSpacingMeters: 5 }
			};
			const wallDistance = Number(minimumWallDistanceMeters);
			if (!Number.isFinite(wallDistance) || wallDistance < 1) {
				throw new Error('Minimum wall distance must be at least 1 m.');
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
									throw new Error('Entry geometry contains an invalid coordinate.');
								}
								return [longitude, latitude];
							})
						)
					}
				: null;
			if (!polygon) throw new Error('Select a polygon capture area first.');
			const generatedPlan = await generateFlightPlanInWorker(
				polygon,
				{
					...presets[detail],
					pattern,
					standOffMeters: wallDistance,
					minimumFaceDistanceMeters: wallDistance,
					cragName: entryName,
					startElevation: plan?.metadata.startElevation,
					name: `${entry?.name || entry?.id || entryName || 'Entry'} capture plan`
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
					: 'Unable to generate a flight plan.';
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
				throw new Error(
					'Enter the launch elevation in metres AMSL before exporting the capture plan.'
				);
			}
			await downloadFlightPlanKmz(plan);
		} catch (downloadError) {
			error =
				downloadError instanceof Error
					? downloadError.message
					: 'Unable to download the capture plan.';
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
			<h3 class="text-ui-label text-near-black !m-0">Drone capture plan</h3>
			<p class="text-[10px] text-warm-gray-400">One native Mavic 4 Pro façade mission.</p>
		</div>
	</div>

	{#if !isPolygon}
		<p class="rounded-sm border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
			Select an entry with polygon geometry before generating a capture plan.
		</p>
	{:else}
		<label class="block text-ui-label text-warm-gray-500">
			Detail
			<select
				bind:value={detail}
				disabled={generating}
				class="input-studio mt-0.5 w-full appearance-none"
			>
				<option value="standard">Standard</option>
				<option value="high">High detail</option>
				<option value="topo">Topo detail</option>
			</select>
		</label>
		<label class="block text-ui-label text-warm-gray-500">
			Pattern
			<select
				bind:value={pattern}
				disabled={generating}
				class="input-studio mt-0.5 w-full appearance-none"
			>
				<option value="facade-grid">Façade grid</option>
				<option value="constant-distance-grid">Constant-distance grid</option>
				<option value="half-helix">Half helix</option>
				<option value="curved-sweep">Curved sweep</option>
			</select>
		</label>
		<label class="block text-ui-label text-warm-gray-500">
			Minimum wall distance (m)
			<input
				type="number"
				min="1"
				step="0.5"
				bind:value={minimumWallDistanceMeters}
				disabled={generating}
				class="input-studio mt-0.5 w-full"
			/>
		</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-creator-blue px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-creator-blue/90"
			onclick={generate}
			disabled={generating}
		>
			<i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
			Generate plan
		</button>
	{/if}

	{#if generating}
		<div class="flex items-center justify-between gap-2 text-[10px]">
			<span role="status">{progress || 'Starting flight calculation…'}</span>
			<button type="button" onclick={cancelGeneration} class="text-warm-gray-600 underline"
				>Cancel</button
			>
		</div>
	{/if}

	{#if error}
		<p class="rounded-sm border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700">
			{error}
		</p>
	{/if}

	{#if plan}
		<div
			class="rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2 text-[10px] text-warm-gray-600"
		>
			<div class="grid grid-cols-2 gap-x-2 gap-y-1">
				<span>Pattern</span><strong class="text-right capitalize text-near-black"
					>{plan.metadata.pattern}</strong
				>
				<span>Capture passes</span><strong class="text-right text-near-black"
					>{plan.metadata.convergentPasses}</strong
				>
				<span>Waypoints</span><strong class="text-right text-near-black"
					>{plan.waypoints.length}</strong
				>
				<span>Detected wall</span>
				<strong class="text-right text-near-black">
					{plan.wallDetection.coordinates.length > 1
						? `${Math.round(plan.wallDetection.confidence * 100)}% confidence`
						: 'Not detected'}
				</strong>
				<span>Wall shape</span>
				<strong class="text-right capitalize text-near-black">
					{plan.wallDetection.coordinates.length > 1 ? plan.wallDetection.shape : 'Unknown'}
				</strong>
				<span>Vertex elevation min.</span><strong class="text-right text-near-black"
					>{plan.metadata.sectorMinimumElevation.toFixed(1)} m</strong
				>
				<span>Vertex elevation max.</span><strong class="text-right text-near-black"
					>{plan.metadata.sectorMaximumElevation.toFixed(1)} m</strong
				>
				<span>Capture height</span><strong class="text-right text-near-black"
					>{plan.metadata.captureHeightMeters.toFixed(1)} m</strong
				>
				<span>Camera</span><strong class="text-right text-near-black">{plan.metadata.camera}</strong
				>
				<span>Photos</span><strong class="text-right text-near-black"
					>{plan.metadata.photoCount}</strong
				>
				<span>Cliff clearance</span>
				<strong class="text-right text-near-black">
					≥ {plan.metadata.minimumFaceDistanceMeters.toFixed(1)} m
				</strong>
				<span>Ground clearance</span>
				<strong class="text-right text-near-black">
					≥ {plan.metadata.minimumGroundClearanceMeters.toFixed(1)} m
				</strong>
				{#if plan.metadata.droppedWaypointCount > 0}
					<span>Waypoints removed</span>
					<strong class="text-right text-near-black">{plan.metadata.droppedWaypointCount}</strong>
				{/if}
				{#if plan.metadata.altitudeCappedWaypointCount > 0}
					<span>Above height cap removed</span>
					<strong class="text-right text-near-black"
						>{plan.metadata.altitudeCappedWaypointCount}</strong
					>
				{/if}
				{#if plan.metadata.fragmentedRowCount > 0}
					<span>Rows replanned</span>
					<strong class="text-right text-near-black">{plan.metadata.fragmentedRowCount}</strong>
				{/if}
				{#if plan.metadata.discardedFragmentWaypointCount > 0}
					<span>Disconnected points removed</span>
					<strong class="text-right text-near-black"
						>{plan.metadata.discardedFragmentWaypointCount}</strong
					>
				{/if}
			</div>
			<label class="mt-2 block text-ui-label text-warm-gray-500">
				Camera view
				<select
					value={cameraPreviewWaypointIndex ?? ''}
					onchange={selectCameraPreview}
					class="input-studio mt-0.5 w-full appearance-none"
				>
					<option value="">Off</option>
					{#each rowStarts as waypoint, row}
						<option value={waypoint.index}>Row {row + 1}</option>
					{/each}
				</select>
			</label>
			<label class="mt-2 block text-ui-label text-warm-gray-500">
				Launch elevation (m AMSL)
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
				Enter the actual takeoff elevation using the same elevation reference as the terrain.
				Clearance checks cover the capture path; approach and return flights require separate
				planning.
			</p>
			<button
				type="button"
				class="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-creator-blue/30 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-creator-blue hover:bg-creator-blue/5"
				onclick={download}
			>
				<i class="fa-solid fa-download text-xs"></i>
				Download Mavic 4 Pro KMZ
			</button>
			<button
				type="button"
				class="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-sm border border-rose-200 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:bg-rose-50"
				onclick={deleteFlightPath}
			>
				<i class="fa-solid fa-trash-can text-xs"></i>
				Delete flight path
			</button>
			<p class="mt-1.5 text-[9px] leading-snug text-warm-gray-500">
				Map preview: yellow dots and the purple line mark the DEM-detected wall base; the dashed
				cyan line marks its clipped top. The constant-distance grid stays between these boundaries.
				Amber is the capture path; green and red mark each row’s start and end.
			</p>
		</div>
	{/if}
</section>

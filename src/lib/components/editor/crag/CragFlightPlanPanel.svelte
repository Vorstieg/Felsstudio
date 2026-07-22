<script>
	import { generateFlightPlan } from '$lib/assets/js/flight-plan-generator.js';
	import { downloadFlightPlanKmz } from '$lib/assets/js/flight-plan-kml.js';

	let {
		sector,
		cragName = '',
		map = null,
		onPlanGenerated = () => {}
	} = $props();

	let detail = $state('topo');
	let pattern = $state('facade-grid');
	let minimumWallDistanceMeters = $state(2);
	let plan = $state(null);
	let error = $state('');
	let cameraPreviewWaypointIndex = $state(null);
	let rowStarts = $derived(
		plan?.waypoints?.filter((waypoint) => waypoint.action === 'startInterval') || []
	);

	function generate() {
		error = '';
		try {
			if (!map?.queryTerrainElevation) {
				throw new Error('Terrain is still loading. Switch to Satellite view and try again.');
			}
			const presets = {
				standard: { targetGsdCm: 1, stripSpacingMeters: 14, pointSpacingMeters: 7 },
				high: { targetGsdCm: 0.7, stripSpacingMeters: 12, pointSpacingMeters: 6 },
				topo: { targetGsdCm: 0.5, stripSpacingMeters: 10, pointSpacingMeters: 5 }
			};
			const wallDistance = Number(minimumWallDistanceMeters);
			if (!Number.isFinite(wallDistance) || wallDistance < 1) {
				throw new Error('Minimum wall distance must be at least 1 m.');
			}
			const terrainElevationAt = (longitude, latitude) => {
				const elevation = map.queryTerrainElevation([longitude, latitude]);
				if (!Number.isFinite(elevation)) {
					throw new Error('MapTerhorn terrain is unavailable here. Switch to Satellite view and wait for terrain to load.');
				}
				return elevation;
			};
			plan = generateFlightPlan(sector?.geometry, {
				...presets[detail],
				pattern,
				standOffMeters: wallDistance,
				minimumFaceDistanceMeters: wallDistance,
				cragName,
				name: `${cragName || 'Crag'} ${sector?.name || sector?.id || 'sector'} capture plan`,
				terrainElevationAt
			});
			plan.filename = `${(cragName || 'crag').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(sector?.name || sector?.id || 'sector').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-capture-plan`;
			plan.metadata.camera = 'tele-6x';
			plan.metadata.photoCount = plan.waypoints.filter((waypoint) => waypoint.phase === 'capture').length;
			cameraPreviewWaypointIndex = plan.waypoints.find(
				(waypoint) => waypoint.action === 'startInterval'
			)?.index;
			plan.previewWaypointIndex = cameraPreviewWaypointIndex;
			onPlanGenerated(plan);
		} catch (generationError) {
			plan = null;
			error = generationError.message || 'Unable to generate a flight plan.';
		}
	}

	async function download() {
		if (!plan) return;
		await downloadFlightPlanKmz(plan);
	}

	function deleteFlightPath() {
		plan = null;
		error = '';
		cameraPreviewWaypointIndex = null;
		onPlanGenerated(null);
	}

	function selectCameraPreview(event) {
		const value = event.currentTarget.value;
		cameraPreviewWaypointIndex = value === '' ? null : Number(value);
		plan = { ...plan, previewWaypointIndex: cameraPreviewWaypointIndex };
		onPlanGenerated(plan);
	}

	let isPolygon = $derived(sector?.geometry?.type === 'Polygon');
</script>

<section class="space-y-2 border-t border-black/15 pt-3">
	<div class="flex items-center gap-2">
		<div class="flex h-6 w-6 items-center justify-center rounded-sm bg-creator-blue/10 text-creator-blue">
			<i class="fa-solid fa-helicopter text-[10px]"></i>
		</div>
		<div>
			<h3 class="text-ui-label text-near-black !m-0">Drone capture plan</h3>
			<p class="text-[10px] text-warm-gray-400">One native Mavic 4 Pro façade mission.</p>
		</div>
	</div>

	{#if !isPolygon}
		<p class="rounded-sm border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
			Set this sector to a polygon before generating a capture plan.
		</p>
	{:else}
		<label class="block text-ui-label text-warm-gray-500">
			Detail
			<select bind:value={detail} class="input-studio mt-0.5 w-full appearance-none">
				<option value="standard">Standard</option>
				<option value="high">High detail</option>
				<option value="topo">Topo detail</option>
			</select>
		</label>
		<label class="block text-ui-label text-warm-gray-500">
			Pattern
			<select bind:value={pattern} class="input-studio mt-0.5 w-full appearance-none">
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
				class="input-studio mt-0.5 w-full"
			/>
		</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-creator-blue px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-creator-blue/90"
			onclick={generate}
		>
			<i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
			Generate plan
		</button>
	{/if}

	{#if error}
		<p class="rounded-sm border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700">{error}</p>
	{/if}

	{#if plan}
		<div class="rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-2 text-[10px] text-warm-gray-600">
			<div class="grid grid-cols-2 gap-x-2 gap-y-1">
				<span>Pattern</span><strong class="text-right capitalize text-near-black">{plan.metadata.pattern}</strong>
				<span>Capture passes</span><strong class="text-right text-near-black">{plan.metadata.convergentPasses}</strong>
				<span>Waypoints</span><strong class="text-right text-near-black">{plan.waypoints.length}</strong>
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
				<span>Vertex elevation min.</span><strong class="text-right text-near-black">{plan.metadata.sectorMinimumElevation.toFixed(1)} m</strong>
				<span>Vertex elevation max.</span><strong class="text-right text-near-black">{plan.metadata.sectorMaximumElevation.toFixed(1)} m</strong>
				<span>Capture height</span><strong class="text-right text-near-black">{plan.metadata.captureHeightMeters.toFixed(1)} m</strong>
				<span>Camera</span><strong class="text-right text-near-black">{plan.metadata.camera}</strong>
				<span>Photos</span><strong class="text-right text-near-black">{plan.metadata.photoCount}</strong>
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
					<strong class="text-right text-near-black">{plan.metadata.altitudeCappedWaypointCount}</strong>
				{/if}
				{#if plan.metadata.fragmentedRowCount > 0}
					<span>Rows replanned</span>
					<strong class="text-right text-near-black">{plan.metadata.fragmentedRowCount}</strong>
				{/if}
				{#if plan.metadata.discardedFragmentWaypointCount > 0}
					<span>Disconnected points removed</span>
					<strong class="text-right text-near-black">{plan.metadata.discardedFragmentWaypointCount}</strong>
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
				Map preview: yellow dots and the purple line mark the DEM-detected wall base; the dashed cyan line marks its clipped top. The constant-distance grid stays between these boundaries. Amber is the capture path; green and red mark each row’s start and end.
			</p>
		</div>
	{/if}
</section>

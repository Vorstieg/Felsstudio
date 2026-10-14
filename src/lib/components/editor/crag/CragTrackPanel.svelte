<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';

	let {
		map = null,
		isExpanded = true,
		open = $bindable(true)
	}: { map?: MapLibreMap | null; isExpanded?: boolean; open?: boolean } = $props();
	const { trackEditor: editor } = getCragEditorTools();
	let tolerance = $state(10);
	let radius = $state(5);
	let minimum = $state(30);
	let summary = $state('');
	let revision = $state(0);
	let segmentIndex = $state(0);
	const button =
		'rounded-sm border border-black/15 bg-white px-2 py-1 text-ui-label text-warm-gray-500 transition-none hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40';
	let busy = $derived(editor.isRoutingTrack || editor.importSegments.length > 0);
	let pending = $derived(editor.operation.kind !== 'idle');
	let boundary = $derived(editor.selectedTrackPointIndex);
	let extending = $derived(editor.trackDraftMode !== 'select');
	let instruction = $derived(editor.instructionKey(isExpanded));
	function project(coordinate: [number, number]) {
		if (!map) return null;
		const point = map.project(coordinate);
		const rect = map.getCanvas().getBoundingClientRect();
		return { x: point.x + rect.left, y: point.y + rect.top };
	}
	let rectangle = $derived.by(() => {
		revision;
		const operation = editor.operation;
		if (operation.kind !== 'box' || !operation.start || !operation.end) return null;
		const a = project(operation.start),
			b = project(operation.end);
		return a && b
			? {
					x: Math.min(a.x, b.x),
					y: Math.min(a.y, b.y),
					width: Math.abs(a.x - b.x),
					height: Math.abs(a.y - b.y)
				}
			: null;
	});
	let splitPoint = $derived.by(() => {
		revision;
		return editor.geometryPreview?.coordinate ? project(editor.geometryPreview.coordinate) : null;
	});
	let selectedPoint = $derived.by(() => {
		revision;
		return boundary !== null && !pending && !extending
			? project(editor.currentTrackPoints[boundary])
			: null;
	});
	function mapWork(action: () => void) {
		action();
		if (!isExpanded) open = false;
		summary = '';
	}
	function simplify() {
		const result = editor.simplifyTrack(tolerance);
		summary = result.changed
			? $_('track.reduced', {
					values: { before: result.previousPointCount, after: result.pointCount }
				})
			: $_('track.noChange');
	}
	function clean() {
		const result = editor.cleanTrackPauses(radius, minimum);
		summary = result.changed
			? $_('track.reduced', {
					values: { before: result.previousPointCount, after: result.pointCount }
				})
			: $_('track.noChange');
	}
	onMount(() => {
		const update = () => revision++;
		map?.on('move', update);
		map?.on('resize', update);
		return () => {
			map?.off('move', update);
			map?.off('resize', update);
		};
	});
</script>

{#if rectangle || splitPoint}
	<svg class="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden="true">
		{#if rectangle}<rect
				{...rectangle}
				fill="rgba(37,99,235,.12)"
				stroke="#2563eb"
				stroke-dasharray="5 4"
			/>{/if}
		{#if splitPoint}<circle
				cx={splitPoint.x}
				cy={splitPoint.y}
				r="12"
				fill="#f59e0b"
				stroke="white"
				stroke-width="3"
			/>{/if}
	</svg>
{/if}
{#if selectedPoint && editor.draftPoints.length > 2}
	<button
		type="button"
		class="fixed z-40 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow-panel hover:bg-red-700 disabled:opacity-40"
		style:left={`${selectedPoint.x + 12}px`}
		style:top={`${selectedPoint.y - 40}px`}
		disabled={busy}
		title={$_('track.delete')}
		aria-label={$_('track.delete')}
		onclick={editor.deleteSelectedTrackPoints}
		><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
	>
{/if}

<ToolOptions title={$_('ui.track_tool_options')} {open} onClose={() => (open = false)}>
	<div class="flex flex-col gap-2">
		<div class="text-xs font-medium text-warm-gray-600">
			{editor.trackName.startsWith('track.') ? $_(editor.trackName) : editor.trackName}
		</div>
		<div class="grid grid-cols-2 gap-1">
			{#each [{ extend: false, label: 'track.edit', icon: 'fa-arrow-pointer' }, { extend: true, label: 'track.extend', icon: 'fa-pen-to-square' }] as tool}
				<button
					type="button"
					class={`flex flex-col items-center gap-1 rounded-sm p-2 transition-none disabled:opacity-40 ${extending === tool.extend ? 'bg-creator-blue text-white' : 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}`}
					aria-pressed={extending === tool.extend}
					disabled={busy || pending || editor.draftTails.length > 0}
					onclick={() =>
						mapWork(() => editor.setTrackDraftMode(tool.extend ? 'routing' : 'select'))}
				>
					<i class={`fa-solid ${tool.icon} text-sm`} aria-hidden="true"></i><span
						class="text-[9px] font-medium">{$_(tool.label)}</span
					>
				</button>
			{/each}
		</div>
		{#if extending && !pending}
			<div class="grid grid-cols-2 gap-1">
				{#each [{ mode: 'routing' as const, label: 'track.follow' }, { mode: 'editing' as const, label: 'track.straightLines' }] as tool}
					<button
						type="button"
						class={`${button} ${editor.trackDraftMode === tool.mode ? '!border-creator-blue !text-creator-blue' : ''}`}
						aria-pressed={editor.trackDraftMode === tool.mode}
						disabled={busy}
						onclick={() => mapWork(() => editor.setTrackDraftMode(tool.mode))}
						>{$_(tool.label)}</button
					>
				{/each}
			</div>
		{/if}
		<p class="text-[10px] text-warm-gray-400" aria-live="polite">{$_(instruction)}</p>
		{#if editor.isRoutingTrack}<p class="text-[10px] text-warm-gray-500" role="status">
				{$_('track.routing')}
			</p>{/if}
		{#if editor.message}<p class="text-[10px] text-amber-700" role="status">
				{$_(editor.message)}
			</p>{/if}
		{#if summary}<p class="text-[10px] text-warm-gray-500" role="status">{summary}</p>{/if}
		{#if editor.hasRoutingFailure}<div class="flex gap-1">
				<button class={button} disabled={editor.isRoutingTrack} onclick={editor.retryRouting}
					>{$_('track.retry')}</button
				><button class={button} disabled={editor.isRoutingTrack} onclick={editor.useStraightSegment}
					>{$_('track.straight')}</button
				>
			</div>{/if}
		{#if pending && editor.operation.kind !== 'join'}<p class="text-[10px] text-warm-gray-500">
				{$_('track.previewHelp')}
			</p>{/if}
		{#if editor.operation.kind === 'join'}
			{#if editor.joinPreview}
				<div class="flex flex-col gap-2 rounded-sm border border-black/10 bg-black/[0.02] p-2">
					<p class="text-[10px] text-warm-gray-500">
						{$_('track.joinWith', {
							values: { name: editor.joinPreview.targetName || $_('track.unnamed') }
						})}
					</p>
					<p class="text-[10px] text-warm-gray-500">
						{$_('track.joinGap', {
							values: { distance: Math.round(editor.joinPreview.gapMeters) }
						})}
					</p>
					<label for="joined-track-name" class="text-[10px] text-warm-gray-500"
						>{$_('track.joinName')}</label
					>
					<input
						id="joined-track-name"
						class="input-studio w-full"
						value={editor.joinPreview.name}
						oninput={(event) => editor.setJoinName(event.currentTarget.value)}
					/>
					<button
						class={`${button} !border-creator-blue !bg-creator-blue !text-white`}
						disabled={editor.primaryAction?.disabled}
						onclick={() => editor.primaryAction?.run()}
						>{$_(editor.primaryAction?.label || 'track.join')}</button
					>
				</div>
			{/if}
			<button class={button} onclick={() => editor.cancelAction?.run()}
				>{$_(editor.cancelAction?.label || 'ui.cancel')}</button
			>
		{/if}
		{#if editor.importSegments.length}
			<label for="gpx-segment" class="text-[10px] text-warm-gray-500"
				>{$_('track.chooseSegment')}</label
			>
			<select id="gpx-segment" class="input-studio w-full" bind:value={segmentIndex}
				>{#each editor.importSegments as segment, index}<option value={index}
						>{segment.name} ({segment.points.length})</option
					>{/each}</select
			>
			<div class="flex gap-1">
				<button
					class={button}
					onclick={() =>
						editor.importSegment(editor.importSegments[segmentIndex] || editor.importSegments[0])}
					>{$_('track.importSegment')}</button
				><button class={button} onclick={editor.cancelImport}>{$_('ui.cancel')}</button>
			</div>
		{/if}
		{#if !pending && !busy}
			{#if !extending}
				<div
					class="flex items-center justify-between gap-2 rounded-sm border border-black/10 bg-black/[0.02] p-2"
				>
					<span class="text-[10px] text-warm-gray-500"
						>{editor.selectedTrackPointCount} {$_('track.selected')}</span
					>
					{#if editor.selectedTrackPointCount}<button
							class={`${button} !border-red-200 !text-red-700`}
							disabled={editor.draftPoints.length - editor.selectedTrackPointCount < 2}
							onclick={editor.deleteSelectedTrackPoints}>{$_('track.delete')}</button
						>{/if}
				</div>
				{#if editor.selectedTrackPointCount && editor.draftPoints.length - editor.selectedTrackPointCount < 2}<p
						class="text-[10px] text-warm-gray-400"
					>
						{$_('track.retainTwo')}
					</p>{/if}
				{#if boundary !== null && editor.draftTails.length === 0}
					<div class="flex gap-1">
						{#if boundary > 0 && editor.draftPoints.length - boundary >= 2}<button
								class={`${button} flex-1`}
								onclick={() => mapWork(() => editor.trimTrackStart(boundary!))}
								>{$_('track.trimBefore')}</button
							>{/if}
						{#if boundary >= 1 && boundary < editor.draftPoints.length - 1}<button
								class={`${button} flex-1`}
								onclick={() => mapWork(() => editor.trimTrackEnd(boundary!))}
								>{$_('track.trimAfter')}</button
							>{/if}
					</div>
				{/if}
				{#if editor.selectedTrackPointCount > 1 && editor.draftTails.length === 0}<div
						class="grid grid-cols-[1fr_auto] items-center gap-1"
					>
						<label class="text-[10px] text-warm-gray-500" for="selection-tolerance"
							>{$_('track.tolerance')}</label
						><input
							id="selection-tolerance"
							class="input-studio w-16"
							type="number"
							min="1"
							bind:value={tolerance}
						/><button class={`${button} col-span-2`} onclick={simplify}
							>{$_('track.simplifySelection')}</button
						>
					</div>{/if}
				<details>
					<summary class="cursor-pointer text-ui-label text-warm-gray-500"
						>{$_('track.selection')}</summary
					>
					<div class="mt-2 grid grid-cols-2 gap-1">
						<button
							class={`${button} ${editor.multiSelect ? '!border-creator-blue !text-creator-blue' : ''}`}
							aria-pressed={editor.multiSelect}
							onclick={() => editor.setMultiSelect(!editor.multiSelect)}
							>{$_('track.multiSelect')}</button
						><button
							class={`${button} ${editor.rangePending ? '!border-creator-blue !text-creator-blue' : ''}`}
							aria-pressed={editor.rangePending}
							onclick={() => mapWork(editor.startRangeSelection)}>{$_('track.range')}</button
						><button class={button} onclick={() => mapWork(editor.startBoxSelection)}
							>{$_('track.box')}</button
						>{#if editor.selectedTrackPointCount}<button
								class={button}
								onclick={editor.clearTrackSelection}>{$_('track.clear')}</button
							>{/if}
					</div>
				</details>
			{/if}
			{#if editor.draftTails.length}<p class="text-[10px] text-warm-gray-500">
					{$_('track.splitStaged')}
				</p>{/if}
			<details>
				<summary
					class="cursor-pointer text-ui-label font-bold uppercase tracking-wide text-warm-gray-500"
					>{$_('track.tools')}</summary
				>
				<div class="mt-2 flex flex-col gap-2 rounded-sm border border-black/10 bg-black/[0.02] p-2">
					{#if editor.draftPoints.length > 1 && editor.draftTails.length === 0}
						{#if editor.activeTrackTarget && !(editor.activeTrackTarget.kind === 'route-path' && editor.activeTrackTarget.isNew)}
							<button class={button} onclick={() => mapWork(editor.startTrackJoin)}
								><i class="fa-solid fa-link text-xs" aria-hidden="true"></i>
								{$_('track.join')}</button
							>
						{/if}
						<div class="grid grid-cols-2 gap-1">
							<button class={button} onclick={editor.reverseTrack}>{$_('track.reverse')}</button
							><button class={button} onclick={() => mapWork(editor.startTrackSplit)}
								><i class="fa-solid fa-scissors text-xs" aria-hidden="true"></i>
								{$_('track.split')}</button
							>
						</div>
						<details>
							<summary class="cursor-pointer text-ui-label text-warm-gray-500"
								>{$_('track.cleanup')}</summary
							>
							<div class="mt-2 flex flex-col gap-2">
								<label for="track-tolerance" class="text-[10px] text-warm-gray-500"
									>{$_('track.tolerance')}</label
								><input
									id="track-tolerance"
									class="input-studio w-full"
									type="number"
									min="1"
									bind:value={tolerance}
								/><button
									class={button}
									onclick={() => {
										editor.clearTrackSelection();
										simplify();
									}}>{$_('track.simplifyAll')}</button
								>
								<div class="grid grid-cols-2 gap-1">
									<label for="track-radius" class="text-[10px] text-warm-gray-500"
										>{$_('track.pauseRadius')}</label
									><label for="track-minimum" class="text-[10px] text-warm-gray-500"
										>{$_('track.minimum')}</label
									><input
										id="track-radius"
										class="input-studio w-full"
										type="number"
										min="1"
										bind:value={radius}
									/><input
										id="track-minimum"
										class="input-studio w-full"
										type="number"
										min="3"
										bind:value={minimum}
									/>
								</div>
								<button class={button} onclick={clean}>{$_('track.cleanAll')}</button>
								<p class="text-[10px] text-warm-gray-400">{$_('track.cleanHelp')}</p>
							</div>
						</details>
					{/if}
					<button
						class={button}
						onclick={() => editor.fitTrackBounds()}
						disabled={!editor.draftPoints.length}>{$_('track.fit')}</button
					>
					<label
						class="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-black/15 bg-warm-white px-3 text-[10px] font-bold uppercase tracking-widest text-creator-blue hover:bg-black/5"
						><i class="fa-solid fa-file-import text-xs" aria-hidden="true"></i>{$_(
							'ui.import_gpx'
						)}<input
							type="file"
							accept=".gpx,application/gpx+xml"
							class="hidden"
							onchange={editor.handleGpxUpload}
						/></label
					>
					{#if editor.activeTrackTarget?.kind !== 'route-path'}<button
							class={button}
							onclick={() => editor.requestLeave(editor.startRoutingDraft)}
							>{$_('track.drawAnother')}</button
						>{/if}
				</div>
			</details>
		{/if}
	</div>
</ToolOptions>

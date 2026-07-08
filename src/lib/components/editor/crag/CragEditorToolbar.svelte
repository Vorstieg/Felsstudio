<script>
	import { _ } from 'svelte-i18n';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';

	let {
		activeTool = $bindable('position'),
		mapStyle = $bindable('transport'),
		currentTrackPoints = [],
		editingTrackIndex = null,
		trackDraftMode = 'routing',
		isRoutingTrack = false,
		onBack = () => {},
		onStartRoutingDraft = () => {},
		onHandleTrackConfirm = () => {},
		onCancelTrackEdit = () => {},
		onGpxUpload = () => {},
		onExport = () => {},
		status = 'idle',
		errorMessage = ''
	} = $props();
</script>

<div class="fixed top-2 left-2 right-2 z-50 block">
	<div class="panel p-1.5 flex items-center justify-between shadow-panel bg-white">
		<div class="flex items-center gap-2.5">
			<button
				class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5"
				onclick={onBack} title="Back to Launcher">
				<i class="fa-solid fa-arrow-left text-[11px]"></i>
			</button>
			<div class="ml-1 mr-3 hidden sm:block">
				<h1 class="text-section-title leading-none">{$_('ui.crag_studio')}</h1>
			</div>
			<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

			<div class="flex items-center gap-1">
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'position' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'position'}>
					<i class="fa-solid fa-location-crosshairs"></i><span class="hidden md:inline">Crag Position</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'parking' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'parking'}>
					<i class="fa-solid fa-square-parking"></i><span class="hidden md:inline">Parking Spot</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'transit' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'transit'}>
					<i class="fa-solid fa-bus"></i><span class="hidden md:inline">Transit Station</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'track' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={onStartRoutingDraft}>
					<i class="fa-solid fa-route"></i><span class="hidden md:inline">Approach Track</span>
				</button>
			</div>

			<div class="w-px h-5 bg-black/15 mx-1 hidden lg:block"></div>

			<div class="hidden lg:flex items-center gap-1 bg-black/5 rounded-sm p-0.5 border border-black/10">
				{#each ['transport', 'satellite', 'terrain'] as style}
					<button
						onclick={() => mapStyle = style}
						class={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-sm transition-none ${mapStyle === style ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-400 hover:bg-black/5'}`}
					>
						{style}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-4 pr-1">
			{#if activeTool === 'track'}
				{#if currentTrackPoints.length > 1}
					<div class="flex items-center gap-1.5">
						<button
							class="flex items-center justify-center gap-1.5 px-3 py-1 bg-creator-blue text-white rounded-sm border border-creator-blue cursor-pointer hover:bg-creator-blue-active transition-none"
							onclick={onHandleTrackConfirm}
							disabled={isRoutingTrack}>
							<i class="fa-solid fa-check text-[10px]"></i><span
							class="text-[10px] font-bold uppercase tracking-widest">{trackDraftMode === 'routing' ? 'Confirm Route' : (editingTrackIndex === null ? 'Create' : 'Save')}</span>
						</button>
						<button
							class="flex items-center justify-center w-7 h-7 bg-black/5 text-warm-gray-500 rounded-sm border border-black/15 cursor-pointer hover:bg-black/10 hover:text-near-black transition-none"
							onclick={onCancelTrackEdit} title="Cancel track edit">
							<i class="fa-solid fa-xmark text-[10px]"></i>
						</button>
					</div>
				{/if}
				<label
					class="flex items-center justify-center gap-1.5 px-3 py-1 bg-black/5 text-creator-blue rounded-sm border border-black/15 cursor-pointer hover:bg-black/10 transition-none mr-2">
					<i class="fa-solid fa-file-import text-[10px]"></i><span
					class="text-[10px] font-bold uppercase tracking-widest">Import GPX</span>
					<input type="file" accept=".gpx" class="hidden" onchange={onGpxUpload} />
				</label>
			{/if}

			{#if isRoutingTrack}
				<span class="text-[10px] font-bold uppercase tracking-widest text-creator-blue">Routing</span>
			{/if}

			<SaveStatus {status} {errorMessage} />
			<button
				class="bg-creator-blue text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-creator-blue-active transition-none uppercase tracking-widest"
				onclick={onExport}
				disabled={status === 'saving'}>
				{$_('save.save_to_server')}
			</button>
		</div>
	</div>
</div>

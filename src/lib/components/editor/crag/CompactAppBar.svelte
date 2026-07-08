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
		onLocateUser = () => {},
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
			<div class="ml-1 mr-3">
				<h1 class="text-section-title leading-none">{$_('ui.crag_studio')}</h1>
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

			<button
				class="w-9 h-9 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-creator-blue transition-none border border-black/10"
				onclick={onLocateUser}
				title="Use current GPS location">
				<i class="fa-solid fa-location-crosshairs text-[12px]"></i>
			</button>
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
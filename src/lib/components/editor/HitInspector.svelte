<script>
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	const userState = getTopoEditorSession();
	import { _ } from 'svelte-i18n';
	import { Vector3 } from 'three';

	let selectedCluster = $derived(
		userState.clustering.clusters.find((c) => c.id === userState.clustering.lockedClusterId)
	);

	let activeHitIdx = $state(null);
	let hoveredHitIdx = $state(null);

	let previewHit = $derived(selectedCluster?.members[hoveredHitIdx] ?? selectedCluster?.members[activeHitIdx] ?? selectedCluster?.members[0] ?? null);

	function close() {
		userState.clustering.lockedClusterId = null;
		userState.clustering.selectedClusterId = null;
		activeHitIdx = null;
		hoveredHitIdx = null;
	}

	function getCropSrc(hit) {
		if (!hit?.crop) return null;

		if (userState.clustering.cropsMap) {
			const cropKey = hit.crop;
			const cropKeyLower = cropKey.toLowerCase();

			if (userState.clustering.cropsMap[cropKey]) return userState.clustering.cropsMap[cropKey];
			if (userState.clustering.cropsMap[cropKeyLower]) return userState.clustering.cropsMap[cropKeyLower];

			// Try matching just the filename in case the map keys are just filenames
			const fileName = cropKey.split('/').pop().split('\\').pop();
			const fileNameLower = fileName.toLowerCase();

			if (userState.clustering.cropsMap[fileName]) return userState.clustering.cropsMap[fileName];
			if (userState.clustering.cropsMap[fileNameLower]) return userState.clustering.cropsMap[fileNameLower];

			// Try matching with crops/ prefix
			if (userState.clustering.cropsMap['crops/' + fileName]) return userState.clustering.cropsMap['crops/' + fileName];
			if (userState.clustering.cropsMap['crops/' + fileNameLower]) return userState.clustering.cropsMap['crops/' + fileNameLower];

			// Ultimate Fuzzy Fallback: if any key in the map contains our filename, return it!
			for (const [key, blobUrl] of Object.entries(userState.clustering.cropsMap)) {
				if (key.includes(fileName) || key.toLowerCase().includes(fileNameLower)) {
					return blobUrl;
				}
			}
		}

		if (hit.crop.startsWith('http') || hit.crop.startsWith('data:') || hit.crop.startsWith('blob:')) {
			return hit.crop;
		}

		// Final fallback: if it's missing from the map, we return null to avoid spurious 404s
		// on relative filenames that don't exist on the server root.
		return null;
	}

	function handleKeyDown(e) {
		if (!selectedCluster || !selectedCluster.members.length) return;

		const key = e.key;

		if (key === 'ArrowLeft') {
			e.preventDefault();
			let currentIdx = activeHitIdx ?? 0;
			currentIdx = (currentIdx - 1 + selectedCluster.members.length) % selectedCluster.members.length;
			activeHitIdx = currentIdx;
			hoveredHitIdx = null;
		} else if (key === 'ArrowRight') {
			e.preventDefault();
			let currentIdx = activeHitIdx ?? 0;
			currentIdx = (currentIdx + 1) % selectedCluster.members.length;
			activeHitIdx = currentIdx;
			hoveredHitIdx = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if previewHit}
	<!-- Big Zoomed Crop Popup -->
	<div
		class="fixed bottom-20 left-2 z-[100] panel p-2 animate-in fade-in slide-in-from-bottom-2 pointer-events-none w-80 shadow-modal bg-white border-black/15">
		<img src={getCropSrc(previewHit)} alt="Zoomed crop"
				 class="w-full aspect-square object-contain rounded-sm bg-black/5 mb-2 border border-black/15" />

		<div class="grid grid-cols-2 gap-x-3 gap-y-2">
			<div class="flex flex-col"><span
				class="text-ui-label uppercase tracking-tighter">{$_('ui.confidence')}</span><span
				class="text-creator-blue font-bold text-[11px]">{(previewHit.conf * 100).toFixed(1)}%</span></div>
			<div class="flex flex-col text-right"><span
				class="text-ui-label uppercase tracking-tighter">{$_('ui.cam_dist')}</span><span
				class="text-near-black font-bold text-[11px] font-mono">{previewHit.cam_dist.toFixed(2)}m</span></div>
			<div class="flex flex-col"><span class="text-ui-label uppercase tracking-tighter">{$_('ui.angle_cos')}</span><span
				class="text-near-black font-bold text-[11px] font-mono">{previewHit.normal_dot.toFixed(3)}</span></div>
			<div class="flex flex-col text-right"><span
				class="text-ui-label uppercase tracking-tighter">{$_('ui.edge_dist')}</span><span
				class="text-near-black font-bold text-[11px] font-mono">{previewHit.edge_dist.toFixed(3)}</span></div>
			<div class="col-span-2 pt-1.5 border-t border-black/10 flex flex-col"><span
				class="text-ui-label uppercase tracking-tighter">{$_('ui.source_image')}</span><span
				class="text-warm-gray-400 text-[10px] truncate font-mono" title={previewHit.img}>{previewHit.img}</span></div>
		</div>
	</div>
{/if}

{#if selectedCluster}
	<!-- Standard Inspection Mode -->
	<div
		class="fixed bottom-2 left-2 right-2 z-50 flex items-center h-16 panel shadow-panel bg-white p-1 animate-in slide-in-from-bottom-2 border-black/15">
		<div class="flex items-center gap-2.5 px-3 border-r border-black/15 h-8 flex-shrink-0 min-w-[140px]">
			<div class="w-2 h-2 rounded-sm shadow-sm border border-white/20"
					 style="background-color: {selectedCluster.color}"></div>
			<div class="flex flex-col justify-center">
				<h2 class="text-section-title leading-none uppercase !text-[12px]">{selectedCluster.class}</h2>
				<p
					class="text-ui-label uppercase tracking-tighter mt-0.5">{selectedCluster.members.length} {$_('ui.observations')}</p>
			</div>
		</div>

		<div class="flex-1 flex items-center gap-1 overflow-x-auto custom-scrollbar px-3 h-full">
			{#each selectedCluster.members as hit, i}
				<button
					class="flex-shrink-0 h-10 w-10 rounded-sm border transition-none overflow-hidden bg-black/5 cursor-pointer {activeHitIdx === i ? 'border-creator-blue ring-1 ring-creator-blue' : 'border-black/10 hover:border-black/30'}"
					onclick={() => activeHitIdx = activeHitIdx === i ? null : i}
					onmouseenter={() => hoveredHitIdx = i}
					onmouseleave={() => hoveredHitIdx = null}
				>
					<img src={getCropSrc(hit)} alt="Detection"
							 class="w-full h-full object-cover grayscale-[0.4] hover:grayscale-0" />
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-6 px-5 border-l border-black/15 h-8 flex-shrink-0">
			<div class="flex items-center gap-6">
				<div class="flex flex-col leading-none"><span
					class="text-ui-label uppercase mb-0.5 tracking-tighter">{$_('ui.spread')}</span><span
					class="text-near-black font-bold font-mono text-[10px]">{selectedCluster.spread_val.toFixed(2)}m</span></div>
				<div class="flex flex-col leading-none"><span
					class="text-ui-label uppercase mb-0.5 tracking-tighter">{$_('ui.angle')}</span><span
					class="text-near-black font-bold font-mono text-[10px]">{selectedCluster.avg_angle.toFixed(3)}</span></div>
			</div>
			<div class="w-px h-5 bg-black/15"></div>
			<button onclick={close} aria-label="Close inspector"
							class="w-8 h-8 flex items-center justify-center rounded-sm bg-black/5 hover:bg-rose-600 hover:text-white transition-none text-warm-gray-500 border border-black/10 shadow-sm cursor-pointer">
				<i class="fa-solid fa-xmark text-sm"></i></button>
		</div>
	</div>
{/if}

<style>
</style>

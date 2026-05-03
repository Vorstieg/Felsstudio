<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import { _ } from 'svelte-i18n';
    import { Vector3 } from 'three';

	let selectedCluster = $derived(
		userState.clustering.clusters.find((c) => c.id === userState.clustering.selectedClusterId)
	);

    let activeHitIdx = $state(null);
    let hoveredHitIdx = $state(null);
    
    let activeHit = $derived(selectedCluster?.members[activeHitIdx] || null);
    let previewHit = $derived(selectedCluster?.members[hoveredHitIdx] ?? activeHit);

    // Conflict Stage Derived Data
    let conflictPair = $derived(userState.clustering.review.stage === 'conflicts' ? userState.clustering.review.conflictPairs[0] : null);
    let conflictClusterA = $derived(conflictPair ? userState.clustering.clusters.find(c => c.id === conflictPair[0]) : null);
    let conflictClusterB = $derived(conflictPair ? userState.clustering.clusters.find(c => c.id === conflictPair[1]) : null);

    let conflictDistance = $derived.by(() => {
        if (!conflictClusterA || !conflictClusterB) return 0;
        const vA = new Vector3(...conflictClusterA.anchor);
        const vB = new Vector3(...conflictClusterB.anchor);
        return Math.round(vA.distanceTo(vB) * 100);
    });

    function close() {
        userState.clustering.selectedClusterId = null;
        userState.clustering.review.stage = null;
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
        }
        
        if (hit.crop.startsWith('http') || hit.crop.startsWith('data:') || hit.crop.startsWith('blob:')) {
            return hit.crop;
        }
        
        // Fallback to returning the path directly so the browser can attempt to load it relative to the current URL or absolute root
        return hit.crop;
    }

    // Keyboard controls for review
    function handleKeyDown(e) {
        const stage = userState.clustering.review.stage;
        if (!stage) return;

        const key = e.key.toLowerCase();

        if (stage === 'noise') {
            const currentId = userState.clustering.selectedClusterId;
            if (key === ' ' || key === 'enter') {
                e.preventDefault();
                userState.approveCluster(currentId);
            }
            if (key === 'delete' || key === 'backspace') {
                e.preventDefault();
                userState.rejectCluster(currentId);
            }
        } else if (stage === 'conflicts') {
            const pair = userState.clustering.review.conflictPairs[0];
            if (!pair) return;
            if (key === 'm') {
                e.preventDefault();
                userState.mergeConflict(pair[0], pair[1], true);
            }
            if (key === 'k') {
                e.preventDefault();
                userState.mergeConflict(pair[0], pair[1], false);
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if previewHit}
    <!-- Big Zoomed Crop Popup -->
    <div class="fixed bottom-20 left-2 z-[100] panel p-2 animate-in fade-in slide-in-from-bottom-2 pointer-events-none w-80 shadow-modal bg-white border-black/15">
        <img src={getCropSrc(previewHit)} alt="Zoomed crop" class="w-full aspect-square object-contain rounded-sm bg-black/5 mb-2 border border-black/15" />
        
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
            <div class="flex flex-col"><span class="text-ui-label uppercase tracking-tighter">Confidence</span><span class="text-creator-blue font-bold text-[11px]">{(previewHit.conf * 100).toFixed(1)}%</span></div>
            <div class="flex flex-col text-right"><span class="text-ui-label uppercase tracking-tighter">Cam Dist</span><span class="text-near-black font-bold text-[11px] font-mono">{previewHit.cam_dist.toFixed(2)}m</span></div>
            <div class="flex flex-col"><span class="text-ui-label uppercase tracking-tighter">Angle Cos</span><span class="text-near-black font-bold text-[11px] font-mono">{previewHit.normal_dot.toFixed(3)}</span></div>
            <div class="flex flex-col text-right"><span class="text-ui-label uppercase tracking-tighter">Edge Dist</span><span class="text-near-black font-bold text-[11px] font-mono">{previewHit.edge_dist.toFixed(3)}</span></div>
            <div class="col-span-2 pt-1.5 border-t border-black/10 flex flex-col"><span class="text-ui-label uppercase tracking-tighter">Source Image</span><span class="text-warm-gray-400 text-[10px] truncate font-mono" title={previewHit.img}>{previewHit.img}</span></div>
        </div>
    </div>
{/if}

{#if userState.clustering.review.stage === 'noise' && selectedCluster}
    <!-- Stage 1: Noise Review -->
    <div class="fixed bottom-2 left-2 right-2 z-50 flex items-center h-16 panel shadow-panel bg-white p-1 animate-in slide-in-from-bottom-2 border-black/15">
        <div class="flex items-center gap-3 px-3 border-r border-black/15 h-10 min-w-[220px]">
            <div class="w-2 h-2 rounded-sm shadow-sm" style="background-color: {selectedCluster.color}"></div>
            <div>
                <h2 class="text-section-title leading-none uppercase">{$_('ui.cluster_review')}</h2>
                <div class="flex items-center gap-2 mt-1">
                    <button 
                        onclick={() => selectedCluster.class = 'bolt'}
                        class="px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-tight transition-none cursor-pointer {selectedCluster.class === 'bolt' ? 'bg-near-black text-white' : 'bg-black/5 text-warm-gray-400 hover:bg-black/10'}"
                    >
                        Bolt
                    </button>
                    <button 
                        onclick={() => selectedCluster.class = 'belay'}
                        class="px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-tight transition-none cursor-pointer {selectedCluster.class === 'belay' || selectedCluster.class === 'anchor' ? 'bg-near-black text-white' : 'bg-black/5 text-warm-gray-400 hover:bg-black/10'}"
                    >
                        Belay
                    </button>
                    <span class="w-px h-3 bg-black/10 mx-1"></span>
                    <p class="text-[9px] text-amber-700 font-bold uppercase tracking-tighter flex items-center gap-1">
                        <i class="fa-solid fa-triangle-exclamation text-[8px]"></i>
                        {#if selectedCluster.members.length < 6}{$_('ui.low_observations')}{:else}{$_('ui.low_confidence')}{/if}
                    </p>
                </div>
            </div>
        </div>

        <div class="flex-1 flex items-center gap-1 overflow-x-auto px-3 h-full custom-scrollbar">
            {#each selectedCluster.members.slice(0, 15) as hit, i}
                <div 
                    class="h-10 w-10 rounded-sm border border-black/10 overflow-hidden bg-black/5 flex-shrink-0 cursor-zoom-in group"
                    onmouseenter={() => hoveredHitIdx = i}
                    onmouseleave={() => hoveredHitIdx = null}
                >
                    <img src={getCropSrc(hit)} alt="Target" class="w-full h-full object-cover grayscale-[0.4] group-hover:grayscale-0 transition-none" />
                </div>
            {/each}
        </div>

        <div class="flex items-center gap-2 px-4 border-l border-black/15 h-10">
            <button 
                onclick={() => userState.rejectCluster(selectedCluster.id)}
                class="flex flex-col items-center justify-center min-w-[100px] h-11 py-0 rounded-sm bg-black/5 hover:bg-rose-600 hover:text-white transition-none text-warm-gray-500 border border-black/10 shadow-sm group cursor-pointer"
            >
                <span class="text-[10px] font-bold uppercase">{$_('ui.reject')}</span>
                <span class="text-[8px] opacity-40 uppercase tracking-tighter font-bold font-mono">Delete</span>
            </button>
            <button 
                onclick={() => userState.approveCluster(selectedCluster.id)}
                class="flex flex-col items-center justify-center min-w-[100px] h-11 py-0 rounded-sm bg-creator-blue text-white hover:bg-creator-blue-active transition-none shadow-sm cursor-pointer"
            >
                <span class="text-[10px] font-bold uppercase">{$_('ui.keep')}</span>
                <span class="text-[8px] text-white/50 uppercase tracking-tighter font-bold font-mono">Space</span>
            </button>
        </div>
    </div>

{:else if userState.clustering.review.stage === 'conflicts' && conflictClusterA && conflictClusterB}
    <!-- Stage 2: Conflict Resolution -->
    <div class="fixed bottom-2 left-2 right-2 z-50 flex items-center h-16 panel shadow-panel bg-white p-1 animate-in slide-in-from-bottom-2 border-black/15">
        <div class="flex items-center gap-3 px-4 border-r border-black/15 h-10 min-w-[260px]">
            <div>
                <h2 class="text-section-title leading-none uppercase">{$_('ui.merge_check')}</h2>
                <p class="text-[10px] text-near-black font-bold uppercase tracking-tighter mt-1">
                    {$_('ui.distance')}: <span class="font-mono">{conflictDistance}cm</span>
                </p>
                <p class="text-[8px] text-warm-gray-400 mt-1 uppercase font-bold tracking-tighter">Duplicate Detection?</p>
            </div>
        </div>

        <div class="flex-1 flex items-center justify-center gap-16 px-8 h-full">
            <div class="flex items-center gap-3">
                <div 
                    class="h-12 w-12 rounded-sm border border-black/15 overflow-hidden shadow-sm cursor-zoom-in group"
                    onmouseenter={() => { userState.clustering.selectedClusterId = conflictClusterA.id; hoveredHitIdx = 0; }}
                    onmouseleave={() => { hoveredHitIdx = null; }}
                >
                    <img src={getCropSrc(conflictClusterA.members[0])} alt="A" class="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-none" />
                </div>
                <div class="flex flex-col text-[9px] font-bold uppercase tracking-tight">
                    <span class="text-warm-gray-400">{$_('ui.cluster_a')}</span>
                    <span class="text-near-black">{conflictClusterA.members.length} Obs</span>
                </div>
            </div>

            <div class="text-warm-gray-300 font-bold text-sm italic tracking-widest px-8 border-x border-black/5">VS</div>

            <div class="flex items-center gap-3">
                <div 
                    class="h-12 w-12 rounded-sm border border-black/15 overflow-hidden shadow-sm cursor-zoom-in group"
                    onmouseenter={() => { userState.clustering.selectedClusterId = conflictClusterB.id; hoveredHitIdx = 0; }}
                    onmouseleave={() => { hoveredHitIdx = null; }}
                >
                    <img src={getCropSrc(conflictClusterB.members[0])} alt="B" class="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-none" />
                </div>
                <div class="flex flex-col text-[9px] font-bold uppercase tracking-tight">
                    <span class="text-warm-gray-400">{$_('ui.cluster_b')}</span>
                    <span class="text-near-black">{conflictClusterB.members.length} Obs</span>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-2 px-4 border-l border-black/15 h-10">
            <button 
                onclick={() => userState.mergeConflict(conflictClusterA.id, conflictClusterB.id, false)}
                class="flex flex-col items-center justify-center min-w-[120px] h-11 py-0 rounded-sm bg-black/5 hover:bg-black/10 text-near-black border border-black/15 transition-none group cursor-pointer"
            >
                <span class="text-[10px] font-bold uppercase">{$_('ui.separate')}</span>
                <span class="text-[8px] opacity-40 uppercase tracking-tighter font-bold font-mono">Key 'K'</span>
            </button>
            <button 
                onclick={() => userState.mergeConflict(conflictClusterA.id, conflictClusterB.id, true)}
                class="flex flex-col items-center justify-center min-w-[120px] h-11 py-0 rounded-sm bg-near-black text-white hover:bg-black transition-none shadow-sm cursor-pointer"
            >
                <span class="text-[10px] font-bold uppercase">{$_('ui.merge')}</span>
                <span class="text-[8px] text-white/50 uppercase tracking-tighter font-bold font-mono">Key 'M'</span>
            </button>
        </div>
    </div>

{:else if userState.clustering.review.stage === 'done'}
    <!-- Stage 3: Summary & Finalization -->
    <div class="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center h-16 panel shadow-panel bg-white p-1 animate-in slide-in-from-bottom-2 w-[480px] border-black/15">
        <div class="flex items-center px-6 border-r border-black/15 h-8 flex-1">
            <div class="flex flex-col justify-center">
                <h2 class="text-section-title leading-none uppercase !text-[12px]">{$_('ui.review_complete')}</h2>
                <p class="text-ui-label uppercase tracking-tighter mt-1 font-bold !text-creator-blue">
                    {userState.clustering.clusters.filter(c => !userState.clustering.review.rejectedIds.has(c.id)).length} {$_('ui.bolts_confirmed')}
                </p>
            </div>
        </div>
        <div class="flex items-center px-4 h-full">
            <button 
                onclick={() => userState.finalizeAiConversion()}
                class="flex flex-col items-center justify-center min-w-[160px] h-11 py-0 rounded-sm bg-creator-blue text-white hover:bg-creator-blue-active transition-none shadow-sm cursor-pointer"
            >
                <span class="text-[10px] font-bold uppercase">{$_('ui.finalize_review')}</span>
                <span class="text-[8px] text-white/50 uppercase tracking-tighter font-bold font-mono">{$_('ui.apply_changes')}</span>
            </button>
        </div>
    </div>

{:else if selectedCluster}
    <!-- Standard Inspection Mode -->
	<div class="fixed bottom-2 left-2 right-2 z-50 flex items-center h-16 panel shadow-panel bg-white p-1 animate-in slide-in-from-bottom-2 border-black/15">
		<div class="flex items-center gap-2.5 px-3 border-r border-black/15 h-8 flex-shrink-0 min-w-[140px]">
			<div class="w-2 h-2 rounded-sm shadow-sm border border-white/20" style="background-color: {selectedCluster.color}"></div>
			<div class="flex flex-col justify-center">
				<h2 class="text-section-title leading-none uppercase !text-[12px]">{selectedCluster.class}</h2>
				<p class="text-ui-label uppercase tracking-tighter mt-0.5">{selectedCluster.members.length} Observations</p>
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
					<img src={getCropSrc(hit)} alt="Detection" class="w-full h-full object-cover grayscale-[0.4] hover:grayscale-0" />
				</button>
			{/each}
		</div>

        <div class="flex items-center gap-6 px-5 border-l border-black/15 h-8 flex-shrink-0">
            <div class="flex items-center gap-6">
                <div class="flex flex-col leading-none"><span class="text-ui-label uppercase mb-0.5 tracking-tighter">Spread</span><span class="text-near-black font-bold font-mono text-[10px]">{selectedCluster.spread_val.toFixed(2)}m</span></div>
                <div class="flex flex-col leading-none"><span class="text-ui-label uppercase mb-0.5 tracking-tighter">Angle</span><span class="text-near-black font-bold font-mono text-[10px]">{selectedCluster.avg_angle.toFixed(3)}</span></div>
            </div>
            <div class="w-px h-5 bg-black/15"></div>
            <button onclick={close} class="w-8 h-8 flex items-center justify-center rounded-sm bg-black/5 hover:bg-rose-600 hover:text-white transition-none text-warm-gray-500 border border-black/10 shadow-sm cursor-pointer"><i class="fa-solid fa-xmark text-sm"></i></button>
        </div>
	</div>
{/if}

<style>
</style>

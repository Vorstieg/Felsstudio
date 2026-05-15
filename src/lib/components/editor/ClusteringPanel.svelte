<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import { runClusteringPipeline } from '$lib/assets/js/clustering.js';
	import { _ } from 'svelte-i18n';

    let initializedHits = $state(0);

    let bounds = $derived.by(() => {
	    let hits = userState.clustering.rawHits;
	    if (!hits || hits.length === 0) return { conf: [0, 1], edge: [0, 1.2], angle: [0, 1], cam: [1, 100] };
	    let conf = [Infinity, -Infinity];
	    let edge = [Infinity, -Infinity];
	    let angle = [Infinity, -Infinity];
	    let cam = [Infinity, -Infinity];
	    for (let h of hits) {
	        if (h.conf < conf[0]) conf[0] = h.conf;
	        if (h.conf > conf[1]) conf[1] = h.conf;
	        let ed = h.edge_dist ?? 0;
	        if (ed < edge[0]) edge[0] = ed;
	        if (ed > edge[1]) edge[1] = ed;
	        let an = h.normal_dot ?? 1;
	        if (an < angle[0]) angle[0] = an;
	        if (an > angle[1]) angle[1] = an;
	        let ca = h.cam_dist ?? 1;
	        if (ca < cam[0]) cam[0] = ca;
	        if (ca > cam[1]) cam[1] = ca;
	    }
	    return {
	        conf: conf[0] === Infinity || conf[0] === conf[1] ? [0, 1] : conf,
	        edge: edge[0] === Infinity || edge[0] === edge[1] ? [0, 1.2] : edge,
	        angle: angle[0] === Infinity || angle[0] === angle[1] ? [0, 1] : angle,
	        cam: cam[0] === Infinity || cam[0] === cam[1] ? [1, 100] : cam
	    };
	});

	$effect(() => {
        const hitCount = userState.clustering.rawHits.length;
        
        if (hitCount > 0 && hitCount !== initializedHits) {
            initializedHits = hitCount;
            userState.clustering.minConfidence = bounds.conf[0] + (bounds.conf[1] - bounds.conf[0]) * 0.33;
            userState.clustering.maxEdgeDist = bounds.edge[0] + (bounds.edge[1] - bounds.edge[0]) * 0.66;
            userState.clustering.minAngleCos = bounds.angle[0] + (bounds.angle[1] - bounds.angle[0]) * 0.33;
            userState.clustering.maxCamDist = Math.round(bounds.cam[0] + (bounds.cam[1] - bounds.cam[0]) * 0.66);
        }

		const params = {
			radius: userState.clustering.radius,
			minConfidence: userState.clustering.minConfidence,
			maxEdgeDist: userState.clustering.maxEdgeDist,
			minAngleCos: userState.clustering.minAngleCos,
			maxCamDist: userState.clustering.maxCamDist,
			minViewSpread: userState.clustering.minViewSpread,
			minObservations: userState.clustering.minObservations
		};

		if (hitCount > 0) {
			const result = runClusteringPipeline(
				userState.clustering.rawHits, 
				params, 
				userState.clustering.gpsData
			);
			userState.clustering.clusters = result.clusters;
			userState.clustering.stats = result.stats;

			if (userState.topo.coordinates[0] === 0 && userState.topo.coordinates[1] === 0) {
				const gpsKeys = Object.keys(userState.clustering.gpsData);
				if (gpsKeys.length > 0) {
					const firstGps = userState.clustering.gpsData[gpsKeys[0]];
					if (firstGps.latitude && firstGps.longitude) {
						userState.topo.coordinates = [firstGps.latitude, firstGps.longitude];
						if (firstGps.abs_alt || firstGps.rel_alt) {
							userState.topo.altitude = firstGps.abs_alt || firstGps.rel_alt;
						}
					}
				}
			}
		}
	});
</script>

<div class="panel flex flex-col shadow-panel overflow-hidden">
	<div class="flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 flex-shrink-0">
		<div>
			<h1 class="text-section-title">{$_('ui.ai-bolts')}</h1>
			<p class="text-ui-label !m-0">{$_('ui.global_controls')}</p>
		</div>
		<div class="flex gap-2">
			<label class="flex items-center gap-1.5 cursor-pointer group">
				<input type="checkbox" bind:checked={userState.clustering.showAnnotations} class="w-3 h-3 rounded-sm border border-black/15 text-creator-blue focus:ring-1 focus:ring-creator-blue transition-none" />
				<span class="text-micro-data text-warm-gray-400 group-hover:text-near-black transition-none">{$_('ui.labels')}</span>
			</label>
		</div>
	</div>

	<div class="p-3 pt-0 space-y-4">
		<!-- Cluster Radius (Header style) -->
		<div class="space-y-1.5">
			<div class="flex justify-between items-center px-1">
				<span class="text-ui-label text-near-black">{$_('ui.clustering_radius')}</span>
				<span class="text-ui-label text-creator-blue font-mono">{userState.clustering.radius.toFixed(2)}m</span>
			</div>
			<input type="range" min="0.05" max="1.5" step="0.01" bind:value={userState.clustering.radius} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
		</div>

		<div class="space-y-3">
			<div class="border-t border-black/15 pt-2">
                <p class="text-[9px] font-black text-warm-gray-400 uppercase tracking-widest mb-2.5 px-1">{$_('ui.hard_cutoffs')}</p>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3 px-1">
                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.confidence')}</span>
                            <span class="text-near-black font-bold">{Math.round(userState.clustering.minConfidence * 100)}%</span>
                        </div>
                        <input type="range" min={bounds.conf[0]} max={bounds.conf[1]} step="0.01" bind:value={userState.clustering.minConfidence} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.edge_dist')}</span>
                            <span class="text-near-black font-bold">{userState.clustering.maxEdgeDist.toFixed(2)}</span>
                        </div>
                        <input type="range" min={bounds.edge[0]} max={bounds.edge[1]} step="0.01" bind:value={userState.clustering.maxEdgeDist} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.angle_cos')}</span>
                            <span class="text-near-black font-bold">{userState.clustering.minAngleCos.toFixed(2)}</span>
                        </div>
                        <input type="range" min={bounds.angle[0]} max={bounds.angle[1]} step="0.01" bind:value={userState.clustering.minAngleCos} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.cam_dist')}</span>
                            <span class="text-near-black font-bold">{userState.clustering.maxCamDist}m</span>
                        </div>
                        <input type="range" min={bounds.cam[0]} max={bounds.cam[1]} step="1" bind:value={userState.clustering.maxCamDist} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>
                </div>
            </div>

            <div class="border-t border-black/15 pt-2">
                <p class="text-[9px] font-black text-warm-gray-400 uppercase tracking-widest mb-2.5 px-1">{$_('ui.filtering')}</p>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3 px-1">
                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.min_spread')}</span>
                            <span class="text-near-black font-bold">{userState.clustering.minViewSpread.toFixed(2)}m</span>
                        </div>
                        <input type="range" min="0" max="2" step="0.05" bind:value={userState.clustering.minViewSpread} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>
                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] leading-none">
                            <span class="text-warm-gray-500">{$_('ui.min_obs')}</span>
                            <span class="text-near-black font-bold">{userState.clustering.minObservations}</span>
                        </div>
                        <input type="range" min="1" max="50" step="1" bind:value={userState.clustering.minObservations} class="w-full h-1 bg-black/10 rounded-none appearance-none cursor-pointer accent-creator-blue" />
                    </div>
                </div>
            </div>
		</div>
	</div>

	<!-- Waterfall Stats -->
	<div class="mt-1 pt-3 border-t border-black/15 bg-black/5 rounded-sm p-2">
		<p class="text-ui-label text-creator-blue mb-1.5">{$_('ui.diagnostics')}</p>
		<div class="space-y-0.5 mb-3">
            <div class="flex justify-between text-micro-data font-mono"><span class="text-warm-gray-500">{$_('ui.input')}</span> <span class="font-bold">{userState.clustering.stats.totalHits}</span></div>
            <div class="flex justify-between text-micro-data font-mono"><span class="text-warm-gray-500">{$_('ui.filtered')}</span> <span class="font-bold">{userState.clustering.stats.totalHits - userState.clustering.stats.confCut - userState.clustering.stats.edgeCut}</span></div>
            <div class="flex justify-between text-micro-data font-mono border-t border-black/15 mt-1 pt-1"><span class="text-near-black font-bold">{$_('ui.final_clusters')}</span> <span class="text-creator-blue font-bold">{userState.clustering.stats.finalClusters}</span></div>
        </div>
	</div>
</div>

<style>
	input[type='range'] {
		-webkit-appearance: none;
		background: transparent;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		height: 10px;
		width: 10px;
		border-radius: 2px;
		background: #ffffff;
		cursor: pointer;
		margin-top: -3px;
		border: 2px solid #0075de;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	input[type='range']::-webkit-slider-runnable-track {
		width: 100%;
		height: 4px;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 0px;
	}
</style>

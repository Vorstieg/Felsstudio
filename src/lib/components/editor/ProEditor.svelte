<script>
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Vector3, WebGLRenderer } from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';

	import Model from '$lib/components/editor/EditorModel.svelte';
    import EditorInternal from '$lib/components/editor/3d/EditorInternal.svelte';
	import MapModal from '$lib/components/ui/MapModal.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import HitInspector from '$lib/components/editor/HitInspector.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';

	// 2D Editor imports
	import Topo2DEditor from '$lib/components/editor/Topo2DEditor.svelte';
	import ToolPalette2D from '$lib/components/editor/ToolPalette2D.svelte';

	import {
		generateSymbolId,
		initializeIdCounters
	} from '$lib/assets/js/id-utils.js';

    let { workspace = '3d-create', children } = $props();

	let activeTool = $state((workspace === '3d-create' || userState.clustering.rawHits.length > 0) ? 'ai-bolts' : null);
	let modelComponent = $state();
    let editorInternal = $state();
	let drawingTarget = $state(null);
	let hasPendingChanges = $state(false);

    // Lasso state
    let selectedIndicesMap = $state(new Map());
    let lassoPoints = $state([]);
    let isDrawingLasso = $state(false);
    let isShiftPressed = $state(false);

	const createRenderer = (canvas) => {
		const context = canvas.getContext('webgl2', {
			alpha: true,
			depth: true,
			stencil: false,
			antialias: true,
			powerPreference: 'high-performance',
			failIfMajorPerformanceCaveat: true,
			desynchronized: true,
			preserveDrawingBuffer: false
		});

		return new WebGLRenderer({
			canvas,
			context,
			powerPreference: 'high-performance',
			antialias: true,
			precision: 'highp',
			alpha: true
		});
	};

	let element = $state();
	let loadedGltfScene = $state(null);
	let modelPositionOffset = $state(userState.topo.modelOffset || [0, 0, 0]);
	let isLoadingGltf = $state(false);
	let gltfError = $state(null);

	let showMapModal = $state(false);
	let showDraftsModal = $state(false);

    // --- Camera Focus Logic (Svelte Native Animation) ---
    const cameraPosStore = tweened([0, 1, 5], { 
        duration: 800, 
        easing: cubicOut 
    });
    const targetPosStore = tweened([0, 0, 0], { 
        duration: 800, 
        easing: cubicOut 
    });

    // Derive values for Threlte
    let cameraPosition = $derived($cameraPosStore);
    let controlsTarget = $derived($targetPosStore);

    let controlsRef = $state();
	let lastSelectedClusterId = null;

	$effect(() => {
		const clusterId = userState.clustering.selectedClusterId;
		if (clusterId && clusterId !== lastSelectedClusterId && userState.clustering.review.stage) {
			lastSelectedClusterId = clusterId;
			const cluster = userState.clustering.clusters.find((c) => c.id === clusterId);
			if (cluster && cluster.members.length > 0) {
				const offset = userState.topo.modelOffset || [0, 0, 0];
				
                // Calculate Anchor (Target)
                const anchor = [
					cluster.anchor[0] + offset[0],
					cluster.anchor[1] + offset[1],
					cluster.anchor[2] + offset[2]
				];
                userState.ui.targetControlsTarget = new Vector3(...anchor);

                // Calculate "Front-Facing" Camera Position
                const hts = cluster.members;
                const avgCamPos = new Vector3(
                    hts.reduce((a, b) => a + b.cam_pos[0], 0) / hts.length,
                    hts.reduce((a, b) => a + b.cam_pos[1], 0) / hts.length,
                    hts.reduce((a, b) => a + b.cam_pos[2], 0) / hts.length
                ).add(new Vector3(...offset));

                const anchorVec = new Vector3(...anchor);
                const viewDir = new Vector3().subVectors(avgCamPos, anchorVec).normalize();
                
                // Target Position (1.5m away for better overview)
                userState.ui.targetCameraPosition = anchorVec.clone().add(viewDir.multiplyScalar(1.5));
                
                // Trigger tween
                targetPosStore.set(anchor);
                cameraPosStore.set([userState.ui.targetCameraPosition.x, userState.ui.targetCameraPosition.y, userState.ui.targetCameraPosition.z]);
			}
		} else if (!clusterId) {
            lastSelectedClusterId = null;
        }
	});

    // Keep OrbitControls in sync with tween
    $effect(() => {
        if (controlsRef && (userState.clustering.selectedClusterId || userState.clustering.review.stage)) {
            const _ = $cameraPosStore;
            const __ = $targetPosStore;
            controlsRef.update();
        }
    });

	onMount(() => {
		draftsState.init();
        initializeIdCounters(userState.topo);
        
        // Force model offset from state
        modelPositionOffset = userState.topo.modelOffset;

		if (userState.ui.modelUrl) {
			loadGlbFromUrl(userState.ui.modelUrl);
		}

        const handleKeyDown = (e) => {
            if (activeTool === 'crop') {
                if (e.key === 'Delete' || e.key === 'Del') applyLassoCut();
                else if (e.key === 'Escape') resetLasso();
                else if (e.key === 'Shift') isShiftPressed = true;
                else if (e.key === 'c' || e.key === 'C') selectFloating();
            }
        };
        const handleKeyUp = (e) => {
            if (e.key === 'Shift') isShiftPressed = false;
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
	});

	async function loadGlbFromUrl(url) {
		isLoadingGltf = true;
		const loader = new GLTFLoader();
		try {
			const gltf = await loader.loadAsync(url);
			loadedGltfScene = gltf.scene;
		} catch (err) {
			console.error('Error loading GLB from state URL', err);
			gltfError = err.message;
		} finally {
			isLoadingGltf = false;
		}
	}

	// --- Auto-save logic ---
	let saveTimeout;
	$effect(() => {
		const topoString = JSON.stringify({
			routes: userState.topo.routes,
			fixPoints: userState.topo.fixPoints,
			outlines: userState.topo.outlines,
			image2D: userState.topo.image2D,
			name: userState.topo.name,
            clustering: userState.clustering,
            glbBlob: userState.ui.glbBlob,
            modelRevision: userState.ui.modelRevision
		});

		if (topoString) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(async () => {
				const id = await draftsState.save(userState.topo, userState.ui.activeDraftId, {
                    clustering: $state.snapshot(userState.clustering),
                    glbBlob: userState.ui.glbBlob
                });
				if (!userState.ui.activeDraftId) userState.ui.activeDraftId = id;
				userState.ui.lastSaved = new Date().toISOString();
			}, 2000);
		}
	});

	function handleFinishRoute() {
		if (editor2D) editor2D.finalize();
		else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
	}

	function handleCancelAction() {
		if (editor2D) editor2D.cancel();
		else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	}

    // --- Lasso Handlers ---
    function handleLassoMouseDown(e) {
        if (activeTool !== 'crop' || !isShiftPressed) return;
        
        // Capture the pointer to ensure we get move/up events even if we leave the window
        e.target.setPointerCapture(e.pointerId);
        
        isDrawingLasso = true;
        lassoPoints = [[e.clientX, e.clientY]];
        
        const onMove = (moveEvent) => {
            if (!isDrawingLasso) return;
            lassoPoints = [...lassoPoints, [moveEvent.clientX, moveEvent.clientY]];
        };
        
        const onUp = (upEvent) => {
            if (isDrawingLasso && lassoPoints.length > 2) {
                editorInternal?.previewLassoCut(lassoPoints);
            }
            isDrawingLasso = false;
            lassoPoints = [];
            e.target.releasePointerCapture(upEvent.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    function applyLassoCut() {
        modelComponent?.applyLassoCut();
    }

    function selectFloating() {
        modelComponent?.selectFloatingGeometry();
    }

    function resetLasso() {
        lassoPoints = [];
        modelComponent?.clearLassoSelection();
    }

    function handleGenerate2DTopo() {
		try {
			const result = generate2DFromTopo(userState.topo);
			if (result.updatedRoutes > 0 || result.updatedFixPoints > 0) {
				userState.topo.editorMode = '2d';
			}
		} catch (err) {
			console.error('Error generating 2D topo:', err);
		}
	}

    function estimateGpsOrigin() {
        const pairs = [];
        const camPositions = userState.clustering.cameraPositions;
        const gpsData = userState.clustering.gpsData;

        for (let fIdx in camPositions) {
            // Find corresponding GPS entry (handling string keys/frame padding)
            const key = Object.keys(gpsData).find(k => fIdx.includes(`frame${k.padStart(6, '0')}`) || k === fIdx);
            if (key && gpsData[key]) {
                const g = gpsData[key];
                if (g.latitude !== 0 && g.longitude !== 0) {
                    pairs.push({
                        glb: camPositions[fIdx],
                        gps: [g.latitude, g.longitude, g.abs_alt || g.rel_alt || 0]
                    });
                }
            }
        }
        if (pairs.length === 0) return null;

        // Origin is at [0,0,0] in GLB space
        const pGlb = [0, 0, 0];
        const dist = (p1, p2) => Math.sqrt(Math.pow(p1[0]-p2[0],2)+Math.pow(p1[1]-p2[1],2)+Math.pow(p1[2]-p2[2],2));

        const nearest = pairs
            .map(p => ({ p, d: dist(pGlb, p.glb) }))
            .sort((a,b) => a.d - b.d)
            .slice(0, 5);
        
        if (nearest[0].d < 0.001) return nearest[0].p.gps;

        let weightSum = 0;
        let estGps = [0,0,0];
        nearest.forEach(n => {
            const w = 1.0 / Math.pow(n.d, 2);
            weightSum += w;
            for(let i=0; i<3; i++) estGps[i] += n.p.gps[i] * w;
        });
        return estGps.map(v => v / weightSum);
    }

    function combinedExport() {
		userState.topo.date = new Date().toISOString().split('T')[0];
		userState.topo.updated = new Date().toISOString().split('T')[0];

		const baseName = (userState.topo.name || 'topo').trim().toLowerCase().replace(/\s+/g, '-');
		let topoToSave = JSON.parse(JSON.stringify(userState.topo));

        if (workspace === '3d-create') {
            // Convert visible clusters to fixPoints
            const confirmedBolts = userState.clustering.clusters.map(c => ({
                id: generateSymbolId(),
                type: c.class || 'bolt',
                position: c.anchor,
                // Optional: store original cluster stats in metadata
                meta: {
                    observations: c.members.length,
                    confidence: c.conf
                }
            }));
            topoToSave.fixPoints = [...(topoToSave.fixPoints || []), ...confirmedBolts];

            // Auto-estimate GPS origin if not set
            if (topoToSave.coordinates[0] === 0 && topoToSave.coordinates[1] === 0) {
                const originGps = estimateGpsOrigin();
                if (originGps) {
                    topoToSave.coordinates = [originGps[0], originGps[1]];
                    topoToSave.altitude = originGps[2];
                }
            }
        }

		const jsonContent = JSON.stringify(topoToSave, undefined, 4);
		const blob = new Blob([jsonContent], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${baseName}-topo.json`;
		a.click();
		URL.revokeObjectURL(url);

		if (userState.topo.editorMode === '3d') {
			modelComponent?.downloadModel(`${baseName}.glb`);
		}
	}

    let editor2D = $state();
</script>

<div class="fixed top-2 left-2 right-2 z-50 {userState.topo.editorMode === '2d' ? 'hidden md:block' : 'block'}">
	{#if userState.topo.editorMode === '3d'}
		<div class="panel p-1.5 flex items-center justify-between shadow-panel bg-white">
			<div class="flex items-center gap-2.5">
				<button class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5" onclick={() => goto(base + '/')} title={$_('ui.back_to_launcher')}>
					<i class="fa-solid fa-arrow-left text-[11px]"></i>
				</button>
				<div class="ml-1 mr-3 hidden sm:block">
					<h1 class="text-section-title leading-none">{$_('ui.3d_studio')}</h1>
				</div>
				<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>
				
				<div class="flex items-center gap-1">
					{#if workspace.includes('3d') && (workspace.includes('create') || userState.clustering.rawHits.length > 0)}
						<button class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'ai-bolts' ? 'bg-creator-blue text-white shadow-sm' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`} onclick={() => { activeTool = 'ai-bolts'; drawingTarget = null; }} title={$_('ui.ai-bolts')}>
							<i class="fa-solid fa-wand-magic-sparkles"></i><span class="hidden md:inline">{$_('ui.ai-bolts')}</span>
						</button>
					{/if}
					<button class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'route' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`} onclick={() => { activeTool = 'route'; drawingTarget = null; }} title={$_('ui.route')}>
						<i class="fa-solid fa-route"></i><span class="hidden md:inline">{$_('ui.route')}</span>
					</button>
					<button class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'multipitch' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`} onclick={() => { activeTool = 'multipitch'; drawingTarget = null; }} title={$_('ui.multipitch')}>
						<i class="fa-solid fa-timeline"></i><span class="hidden md:inline">{$_('ui.multipitch')}</span>
					</button>
					<button class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'fixpoint' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`} onclick={() => { activeTool = 'fixpoint'; drawingTarget = null; }} title={$_('ui.fixpoint')}>
						<i class="fa-solid fa-circle-dot"></i><span class="hidden md:inline">{$_('ui.fixpoint')}</span>
					</button>
                    <button class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'crop' ? 'bg-creator-blue text-white shadow-sm' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`} onclick={() => { activeTool = 'crop'; drawingTarget = null; lassoPoints = []; }} title={$_('ui.crop')}>
                        <i class="fa-solid fa-scissors"></i><span class="hidden md:inline">{$_('ui.crop')}</span>
                    </button>
				</div>

                <div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

                <label class="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-black/5 cursor-pointer group transition-none">
                    <input type="checkbox" bind:checked={userState.clustering.showCameraTrail} class="w-3 h-3 rounded-sm border border-black/15 text-creator-blue focus:ring-1 focus:ring-creator-blue transition-none" />
                    <span class="text-ui-label text-warm-gray-500 group-hover:text-near-black transition-none">Show Camera Trail</span>
                </label>
			</div>

			<div class="flex items-center gap-4 pr-1">
                {#if userState.ui.lastSaved}
                    <div class="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-sm bg-black/5 text-warm-gray-400">
                        <i class="fa-solid fa-cloud-check text-[9px]"></i>
                        <span class="text-[9px] font-bold uppercase tracking-tighter">{$_('ui.saved')}</span>
                    </div>
                {/if}
				<button class="bg-near-black text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-black transition-none uppercase tracking-widest" onclick={combinedExport}>
					{$_('ui.export')}
				</button>
			</div>
		</div>
	{:else}
		<div class="hidden md:block">
            <ToolPalette2D 
                bind:activeTool 
                bind:selectedSymbol={userState.ui.selectedSymbol} 
                {hasPendingChanges} 
                onFinishRoute={handleFinishRoute} 
                onCancelAction={handleCancelAction} 
                onUndo={() => editor2D?.undo()}
                onRedo={() => editor2D?.redo()}
                onExport={combinedExport}
            />
		</div>
	{/if}
</div>

<!-- Floating Hint Panels for 3D Mode -->
{#if userState.topo.editorMode === '3d' && activeTool && activeTool !== 'ai-bolts'}
    <div class="fixed top-[56px] left-2 flex items-center gap-3 p-1.5 bg-white rounded-sm border border-black/15 shadow-modal z-[100]">
        <div class="px-2 py-0.5 border-r border-black/10">
            <p class="text-ui-label text-near-black !m-0">{$_(`ui.${activeTool}`)}</p>
        </div>
        <div class="flex items-center gap-4 px-1 text-warm-gray-500">
            {#if activeTool === 'route'}
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.set_vertex')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Dbl Click</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.undo_vertex')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Backspace</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.finalize')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Enter</kbd></div>
            {:else if activeTool === 'multipitch'}
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.vertex')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Dbl Click</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.undo_vertex')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Backspace</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.place_belay')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">B</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.finalize')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Enter</kbd></div>
            {:else if activeTool === 'fixpoint'}
                <div class="flex items-center gap-1.5 text-micro-data"><span>{$_('ui.place_point')}</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Dbl Click</kbd></div>
                <div class="w-px h-4 bg-black/10 mx-1"></div>
                <div class="flex items-center gap-1">
                    {#each ['bolt', 'belay', 'piton', 'tree', 'abseil'] as type}
                        <button 
                            class="flex items-center gap-2 h-7 px-2.5 rounded-sm transition-none border {userState.ui.selectedSymbol === type ? 'bg-creator-blue text-white border-creator-blue shadow-sm' : 'bg-black/5 text-warm-gray-500 border-black/5 hover:bg-black/10 hover:text-near-black'}"
                            onclick={() => userState.ui.selectedSymbol = type}
                            title={$_(`topo.fixpoints.${type}`)}
                        >
                            <img src="/icons/topo-symbols/{type}.svg" alt={type} class="w-3 h-3 {userState.ui.selectedSymbol === type ? 'invert brightness-0' : 'opacity-70'}" />
                            <span class="text-[9px] font-bold uppercase tracking-tighter">{$_(`topo.fixpoints.${type}`)}</span>
                        </button>
                    {/each}
                </div>
            {:else if activeTool === 'crop'}
                <div class="flex items-center gap-1.5 text-micro-data"><span>Select Area</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Shift + Drag</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>Select Islands</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">C</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>Apply Cut</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Delete</kbd></div>
                <div class="flex items-center gap-1.5 text-micro-data"><span>Reset</span> <kbd class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm">Esc</kbd></div>
            {/if}
        </div>
    </div>
{/if}

{#if activeTool === 'crop'}
    <div 
        class="fixed inset-0 z-[200] touch-none select-none bg-indigo-500/5 transition-opacity {isShiftPressed ? 'opacity-100 cursor-crosshair' : 'opacity-0 pointer-events-none'}"
        style="pointer-events: {isShiftPressed ? 'all' : 'none'};"
        onpointerdown={handleLassoMouseDown}
        oncontextmenu={(e) => e.preventDefault()}
    >
        <svg class="w-full h-full pointer-events-none">
            {#if lassoPoints.length > 1}
                <polygon
                    points={lassoPoints.map(p => p.join(',')).join(' ')}
                    fill="rgba(99, 102, 241, 0.2)"
                    stroke="#6366f1"
                    stroke-width="2"
                    stroke-dasharray="5 3"
                />
            {/if}
            {#if lassoPoints.length === 1}
                <circle cx={lassoPoints[0][0]} cy={lassoPoints[0][1]} r="3" fill="#6366f1" />
            {/if}
        </svg>
    </div>
{/if}

<!-- Sidebar Area for Children -->
<div class="fixed {activeTool && activeTool !== 'ai-bolts' ? 'top-[100px]' : 'top-[56px]'} left-2 z-40 flex flex-col w-80 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
    {#if userState.topo.editorMode === '3d' && activeTool === 'ai-bolts'}
        {@render children?.()}
    {/if}
</div>

{#if userState.topo.editorMode === '3d' && activeTool === 'ai-bolts' && (workspace.includes('create') || userState.clustering.rawHits.length > 0)}
    <HitInspector />
{/if}

<div class="md:hidden">
	{#if userState.topo.editorMode === '2d'}
		<ToolPalette2D 
            bind:activeTool 
            bind:selectedSymbol={userState.ui.selectedSymbol} 
            {hasPendingChanges} 
            onFinishRoute={handleFinishRoute} 
            onCancelAction={handleCancelAction}
            onUndo={() => editor2D?.undo()}
            onRedo={() => editor2D?.redo()}
            onExport={combinedExport}
        />
	{/if}
</div>

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	{#if userState.topo.editorMode === '2d'}
		<Topo2DEditor bind:this={editor2D} bind:activeTool selectedSymbol={userState.ui.selectedSymbol} {drawingTarget} bind:hasPendingChanges />
	{:else}
		<div id="css-renderer-target" bind:this={element} style="position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; height: 100%; z-index: 1;"></div>
		<Canvas linear {createRenderer} dpr={browser ? window.devicePixelRatio : 1}>
			<T.PerspectiveCamera makeDefault position={cameraPosition} fov={75} near={0.1} far={1000}><OrbitControls bind:ref={controlsRef} enableZoom={true} target={controlsTarget} enabled={activeTool !== 'crop' || !isShiftPressed} /></T.PerspectiveCamera>
			<T.AmbientLight intensity={1.0} /><T.DirectionalLight position={[5, 10, 7]} intensity={1.2} /><T.HemisphereLight skyColor={'#ffffff'} groundColor={'#444444'} intensity={0.5} />
			{#if element !== undefined}
                <Model bind:this={modelComponent} gltfScene={loadedGltfScene} position={modelPositionOffset} scale={userState.topo.scale} {activeTool} {drawingTarget} {element} bind:cameraPosition bind:controlsTarget bind:selectedIndicesMap>
                    <EditorInternal bind:this={editorInternal} {loadedGltfScene} {element} bind:selectedIndicesMap {activeTool} {drawingTarget} {cameraPosition} {controlsTarget} {controlsRef} />
                </Model>
            {/if}
		</Canvas>
	{/if}
</div>

<TopoPropertiesPanel bind:showMapModal bind:drawingTarget bind:activeTool />

{#if showMapModal}
    <MapModal
        bind:coordinates={userState.topo.coordinates}
        bind:wallAzimuth={userState.topo.wallAzimuth}
        bind:altitude={userState.topo.altitude}
        bind:scale={userState.topo.scale}
        gltfScene={loadedGltfScene}
        modelOffset={userState.topo.modelOffset}
        onClose={() => {
            showMapModal = false;
            // Force refresh of model offset in 3D view
            modelPositionOffset = [...userState.topo.modelOffset];
        }}
    />
{/if}

<style>
	:global(.route-label) { 
        background-color: white; 
        color: #0075de; 
        padding: 2px 10px; 
        border-radius: 4px; 
        font-size: 11px; 
        font-weight: 800; 
        font-family: 'Atkinson Hyperlegible', sans-serif; 
        white-space: nowrap; 
        text-align: center; 
        cursor: pointer; 
        border: 1.5px solid rgba(0, 117, 222, 0.4); 
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        transition: all 0.15s ease-out;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    :global(.route-label::before) {
        content: '';
        display: block;
        width: 6px;
        height: 6px;
        background-color: #0075de;
        border-radius: 50%;
    }
    :global(.route-label:hover) {
        transform: translateY(-1px) scale(1.05);
        border-color: rgba(0, 117, 222, 0.8);
        box-shadow: 0 4px 12px rgba(0, 117, 222, 0.2);
    }
    :global(.route-label.selected) {
        background-color: #0075de;
        color: white;
        border-color: #0056b3;
        box-shadow: 0 4px 16px rgba(0,117,222,0.4);
    }
    :global(.route-label.selected::before) {
        background-color: white;
    }
	:global(.fixpoint-label) { background-color: rgba(255, 255, 255, 0.9); backdrop-filter: blur(4px); color: #000; padding: 0px; border-radius: 50%; font-size: 10px; font-weight: 900; font-family: 'Inter', sans-serif; text-align: center; pointer-events: none; width: 18px; height: 18px; line-height: 18px; margin-top: -30px; border: 2px solid #0075de; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
</style>

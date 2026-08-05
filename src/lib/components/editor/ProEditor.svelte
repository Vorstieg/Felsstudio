<script>
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Vector3, WebGLRenderer } from 'three';
	import { createGltfLoader } from '$lib/assets/js/gltf-loader.js';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	import Model from '$lib/components/editor/EditorModel.svelte';
	import EditorInternal from '$lib/components/editor/3d/EditorInternal.svelte';
	import MapModal from '$lib/components/ui/MapModal.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import HitInspector from '$lib/components/editor/HitInspector.svelte';
	import { createTopoEditorSession, provideTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import { isBlankTopoSession } from '$lib/state/drafts.svelte.js';
	import { useTopoDraftAutosave } from '$lib/components/editor/use-topo-draft-autosave.svelte.js';
	import { isMobileViewport } from '$lib/assets/js/mobile-utils.js';

	// 2D Editor imports

	import { generateSymbolId, initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import ToolPalette3D from '$lib/components/editor/3d/ToolPalette3D.svelte';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
import { fixpointSymbols } from '@vorstieg/topo-renderer';

	let { workspace = '3d-create', children } = $props();
	const userState = provideTopoEditorSession(createTopoEditorSession());
	let isMobile = $state(false);
	let saveStatus = $state('idle');
	let saveError = $state('');

	function getInitialActiveTool() {
		return userState.clustering.rawHits.length > 0 ? 'ai-bolts' : null;
	}

	function getInitialWorkspace() {
		return workspace;
	}

	userState.ui.workspace = getInitialWorkspace();

	let activeTool = $state(getInitialActiveTool());
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
		const clusterId = userState.clustering.lockedClusterId;
		if (clusterId && clusterId !== lastSelectedClusterId) {
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
				userState.transient.targetControlsTarget = new Vector3(...anchor);

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
				userState.transient.targetCameraPosition = anchorVec.clone().add(viewDir.multiplyScalar(1.5));

				// Trigger tween
				targetPosStore.set(anchor);
				cameraPosStore.set([
					userState.transient.targetCameraPosition.x,
					userState.transient.targetCameraPosition.y,
					userState.transient.targetCameraPosition.z
				]);
			}
		} else if (!clusterId) {
			lastSelectedClusterId = null;
		}
	});

	// Keep OrbitControls in sync with tween
	$effect(() => {
		if (controlsRef && userState.clustering.lockedClusterId) {
			controlsRef.update();
		}
	});

	onMount(async () => {
		initializeIdCounters(userState.topo);

		// Initialize mobile detection (client-side only)
		isMobile = isMobileViewport();
		const handleResize = () => {
			isMobile = isMobileViewport();
		};
		window.addEventListener('resize', handleResize);

		// Force model offset from state
		modelPositionOffset = userState.topo.modelOffset;

		if (userState.transient.modelUrl) {
			loadGlbFromUrl(userState.transient.modelUrl);
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
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	function restoreSession(session, id) {
		const topo = session.topo || session;
		userState.loadSession(session, id);
		userState.ui.workspace = topo.editorMode === '2d' ? 'topos/2d/editor' : 'topos/3d/editor';
	}

	useTopoDraftAutosave({
		session: userState,
		draftId: browser ? new URL(window.location.href).searchParams.get('draft') : null,
		editorMode: '3d',
		getWorkspace: () => workspace,
		shouldRestore: () =>
			workspace.endsWith('edit') ||
			isBlankTopoSession({
				topo: userState.topo,
				clustering: userState.clustering,
				glbBlob: userState.transient.glbBlob
			}),
		restoreSession: (session, id) => {
			restoreSession(session, id);
			activeTool = getInitialActiveTool();
			initializeIdCounters(userState.topo);
		},
		getSaveSignature: () =>
			JSON.stringify({
				routes: userState.topo.routes,
				fixPoints: userState.topo.fixPoints,
				outlines: userState.topo.outlines,
				textLabels: userState.topo.textLabels,
				image2D: userState.topo.image2D,
				imageAspectRatio: userState.topo.imageAspectRatio,
				canvasAspectRatio: userState.topo.canvasAspectRatio,
				backgroundFit: userState.topo.backgroundFit,
				name: userState.topo.name,
				crag_id: userState.topo.crag_id,
				sector_id: userState.topo.sector_id,
				clustering: userState.clustering,
				glbBlob: userState.transient.glbBlob,
				modelRevision: userState.transient.modelRevision
			}),
		getExtra: () => ({
			clustering: $state.snapshot(userState.clustering),
			glbBlob: userState.transient.glbBlob
		})
	});

	async function loadGlbFromUrl(url) {
		isLoadingGltf = true;
		const loader = createGltfLoader();
		try {
			const gltf = await loader.loadAsync(url);

			gltf.scene.traverse((child) => {
				if (child.isMesh && child.geometry) {
					if (child.material) {
						const mats = Array.isArray(child.material) ? child.material : [child.material];
						mats.forEach((m) => {
							if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
								m.roughness = Math.max(m.roughness || 0, 0.8);
								m.metalness = 0;
							}
							m.needsUpdate = true;
						});
					}
				}
			});

			loadedGltfScene = gltf.scene;
		} catch (err) {
			console.error('Error loading GLB from state URL', err);
			gltfError = err.message;
		} finally {
			isLoadingGltf = false;
		}
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
		//TODO: Actually implement this
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
			const key = Object.keys(gpsData).find(
				(k) => fIdx.includes(`frame${k.padStart(6, '0')}`) || k === fIdx
			);
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
		const dist = (p1, p2) =>
			Math.sqrt(
				Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2)
			);

		const nearest = pairs
			.map((p) => ({ p, d: dist(pGlb, p.glb) }))
			.sort((a, b) => a.d - b.d)
			.slice(0, 5);

		if (nearest[0].d < 0.001) return nearest[0].p.gps;

		let weightSum = 0;
		let estGps = [0, 0, 0];
		nearest.forEach((n) => {
			const w = 1.0 / Math.pow(n.d, 2);
			weightSum += w;
			for (let i = 0; i < 3; i++) estGps[i] += n.p.gps[i] * w;
		});
		return estGps.map((v) => v / weightSum);
	}

	async function combinedExport() {
		// Require authentication
		if (!authState.requireAuth(() => combinedExport())) return;

		try {
			if (modelComponent) {
				await modelComponent.bakeTransforms();
			}

			userState.topo.date = userState.topo.date || new Date().toISOString().split('T')[0];
			userState.topo.updated = new Date().toISOString().split('T')[0];

			let topoToSave = JSON.parse(JSON.stringify(userState.topo));

			// Remove internal UI fields before saving
			delete topoToSave._entryPath;
			delete topoToSave._topoFileName;

			if (workspace === '3d-create') {
				// Convert visible clusters to fixPoints
				const confirmedBolts = userState.clustering.clusters.map((c) => ({
					id: generateSymbolId(),
					type: c.class || 'bolt',
					position: c.anchor,
					meta: {
						observations: c.members.length,
						confidence: c.conf
					}
				}));
				topoToSave.fixPoints = [...(topoToSave.fixPoints || []), ...confirmedBolts];

				if (topoToSave.coordinates[0] === 0 && topoToSave.coordinates[1] === 0) {
					const originGps = estimateGpsOrigin();
					if (originGps) {
						topoToSave.coordinates = [originGps[0], originGps[1]];
						topoToSave.altitude = originGps[2];
					}
				}
			}

			// Save topo JSON to Felslager
			await writeJson(userState.topo._topoFileName, topoToSave);

			// Upload GLB model if available (3D mode)
			if (userState.transient.glbBlob) {
				await writeFile(
					userState.topo._topoFileName.replace(/-topo\.json$/, '.glb'),
					userState.transient.glbBlob,
					'model/gltf-binary'
				);
			}

			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (err) {
			console.error('Save failed:', err);
			saveStatus = 'error';
			saveError = err.message;
		}
	}
</script>

<div class="fixed top-2 left-2 right-2 z-50 'block'}">
	<ToolPalette3D
		{saveStatus}
		{saveError}
		{combinedExport}
		bind:activeTool
		bind:drawingTarget
		bind:lassoPoints
		bind:clustering={userState.clustering}
	></ToolPalette3D>
</div>

<!-- Floating Hint Panels for 3D Mode -->
{#if activeTool && activeTool !== 'ai-bolts'}
	<ToolOptions title={$_(`ui.${activeTool}`)} onClose={() => (activeTool = null)}>
		<div class="flex flex-col gap-2 text-warm-gray-500">
			{#if activeTool === 'route'}
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.set_vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Dbl Click</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.undo_vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Backspace</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.finalize')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Enter</kbd
					>
				</div>
			{:else if activeTool === 'multipitch'}
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Dbl Click</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.undo_vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Backspace</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.place_belay')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>B</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.finalize')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Enter</kbd
					>
				</div>
			{:else if activeTool === 'fixpoint'}
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.place_point')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Dbl Click</kbd
					>
				</div>
				<div class="w-px h-4 bg-black/10 mx-1"></div>
				<div class="flex items-center gap-1">
					{#each fixpointSymbols as symbol}
						<button
							class="flex items-center gap-2 h-7 px-2.5 rounded-sm transition-none border {userState
								.ui.selectedSymbol === symbol.id
								? 'bg-creator-blue text-white border-creator-blue shadow-sm'
								: 'bg-black/5 text-warm-gray-500 border-black/5 hover:bg-black/10 hover:text-near-black'}"
							onclick={() => (userState.ui.selectedSymbol = symbol.id)}
							title={$_(`topo.fixpoints.${symbol.id}`)}
						>
							<img
								src={symbol.icon}
								alt={symbol.name}
								class="w-3 h-3 {userState.ui.selectedSymbol === symbol.id
									? 'invert brightness-0'
									: 'opacity-70'}"
							/>
							<span class="text-[9px] font-bold uppercase tracking-tighter"
							>{$_(`topo.fixpoints.${symbol.id}`)}</span
							>
						</button>
					{/each}
				</div>
			{:else if activeTool === 'crop'}
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>Select Area</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Shift + Drag</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>Select Islands</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>C</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>Apply Cut</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Delete</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>Reset</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
					>Esc</kbd
					>
				</div>
			{/if}
		</div>
	</ToolOptions>
{/if}

{#if activeTool === 'crop'}
	<div
		class="fixed inset-0 z-200 touch-none select-none bg-indigo-500/5 transition-opacity {isShiftPressed
			? 'opacity-100 cursor-crosshair'
			: 'opacity-0 pointer-events-none'}"
		style="pointer-events: {isShiftPressed ? 'all' : 'none'};"
		onpointerdown={handleLassoMouseDown}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<svg class="w-full h-full pointer-events-none">
			{#if lassoPoints.length > 1}
				<polygon
					points={lassoPoints.map((p) => p.join(',')).join(' ')}
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
<div
	class="fixed {activeTool && activeTool !== 'ai-bolts'
		? 'top-25'
		: 'top-14'} left-2 z-40 flex flex-col w-80 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar"
>
	{#if activeTool === 'ai-bolts'}
		{@render children?.()}
	{/if}
</div>

{#if activeTool === 'ai-bolts' && userState.clustering.rawHits.length > 0}
	<HitInspector />
{/if}

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div
		id="css-renderer-target"
		bind:this={element}
		style="position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; height: 100%; z-index: 1;"
	></div>
	<Canvas linear {createRenderer} dpr={browser ? window.devicePixelRatio : 1}>
		<T.PerspectiveCamera makeDefault position={cameraPosition} fov={75} near={0.1} far={1000}>
			<OrbitControls
				bind:ref={controlsRef}
				enableZoom={true}
				target={controlsTarget}
				enabled={activeTool !== 'crop' || !isShiftPressed}
			/>
		</T.PerspectiveCamera>
		<T.AmbientLight intensity={1.0} />
		<T.DirectionalLight position={[5, 10, 7]} intensity={1.2} />
		<T.HemisphereLight skyColor={'#ffffff'} groundColor={'#444444'} intensity={0.5} />
		{#if element !== undefined}
			<Model
				bind:this={modelComponent}
				gltfScene={loadedGltfScene}
				{activeTool}
				{drawingTarget}
				{element}
				bind:cameraPosition
				bind:controlsTarget
				bind:selectedIndicesMap
			>
				<EditorInternal
					bind:this={editorInternal}
					{loadedGltfScene}
					{element}
					bind:selectedIndicesMap
					{activeTool}
					{drawingTarget}
					{cameraPosition}
					{controlsTarget}
					{controlsRef}
				/>
			</Model>
		{/if}
	</Canvas>
</div>

<TopoPropertiesPanel bind:showMapModal bind:drawingTarget bind:activeTool />

{#if showMapModal}
	<MapModal
		bind:coordinates={userState.topo.coordinates}
		bind:altitude={userState.topo.altitude}
		gltfScene={loadedGltfScene}
		bind:modelRotation={userState.topo.modelRotation}
		bind:modelScale={userState.topo.modelScale}
		onClose={() => {
			showMapModal = false;
		}}
	/>
{/if}

<script>
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Vector3, WebGLRenderer } from 'three';
	import { createGltfLoader } from '$lib/assets/js/gltf-loader.js';
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
	import { isMobileViewport } from '$lib/assets/js/mobile-utils.js';
	import { topoSymbols } from '$lib/assets/js/topo-utils.js';

	// 2D Editor imports
	import Topo2DEditor from '$lib/components/editor/2d/Topo2DEditor.svelte';
	import ToolPalette2D from '$lib/components/editor/2d/ToolPalette2D.svelte';
	import OutlineToolOptions from '$lib/components/editor/tools/OutlineToolOptions.svelte';

	import { generateSymbolId, initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';

	let { workspace = '3d-create', children } = $props();
	let isMobile = $state(false);
	let saveStatus = $state('idle');
	let saveError = $state('');

	function getInitialEditorMode() {
		return workspace.includes('/2d') || workspace.startsWith('2d') ? '2d' : '3d';
	}

	function getInitialActiveTool() {
		return getInitialEditorMode() === '3d' || userState.clustering.rawHits.length > 0 ? 'ai-bolts' : null;
	}

	function getInitialWorkspace() {
		return workspace;
	}

	function isBlankTopoSession() {
		return (
			!userState.topo.name &&
			!userState.topo.crag_id &&
			!userState.topo.sector_id &&
			!userState.topo.description &&
			!userState.topo.image2D &&
			(userState.topo.routes || []).length === 0 &&
			(userState.topo.fixPoints || []).length === 0 &&
			(userState.topo.outlines || []).length === 0 &&
			(userState.topo.textLabels || []).length === 0 &&
			!userState.ui.glbBlob &&
			!userState.ui.modelUrl &&
			(userState.clustering.rawHits || []).length === 0
		);
	}

	const initialEditorMode = getInitialEditorMode();
	userState.topo.editorMode = initialEditorMode;
	if (
		(userState.ui.activeDraftId?.startsWith('2d-') && initialEditorMode !== '2d') ||
		(userState.ui.activeDraftId?.startsWith('3d-') && initialEditorMode !== '3d')
	) {
		userState.reset();
		userState.topo.editorMode = initialEditorMode;
	}
	userState.ui.workspace = getInitialWorkspace();

	let activeTool = $state(getInitialActiveTool());
	let selectedOutlineStyle = $state('rock');
	let modelComponent = $state();
	let editorInternal = $state();
	let drawingTarget = $state(null);
	let hasPendingChanges = $state(false);
	let canAutosave = $state(false);
	const fixpointSymbols = topoSymbols.filter((symbol) => symbol.type === 'fixpoint');

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
				cameraPosStore.set([
					userState.ui.targetCameraPosition.x,
					userState.ui.targetCameraPosition.y,
					userState.ui.targetCameraPosition.z
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
		draftsState.init();

		if (!userState.ui.activeDraftId && (workspace.endsWith('edit') || isBlankTopoSession())) {
			const latest = await draftsState.getLatest(getInitialEditorMode());
			if (latest) {
				restoreSession(latest.session, latest.id);
				activeTool = getInitialActiveTool();
			}
		}

		initializeIdCounters(userState.topo);

		// Initialize mobile detection (client-side only)
		isMobile = isMobileViewport();
		const handleResize = () => {
			isMobile = isMobileViewport();
		};
		window.addEventListener('resize', handleResize);

		// Force model offset from state
		modelPositionOffset = userState.topo.modelOffset;

		if (userState.ui.modelUrl) {
			loadGlbFromUrl(userState.ui.modelUrl);
		}

		canAutosave = true;

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
			clearTimeout(saveTimeout);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	function restoreSession(session, id) {
		userState.reset();

		// Handle legacy drafts vs new session structure
		const topo = session.topo || session;
		userState.topo = topo;

		if (session.clustering) {
			userState.clustering = { ...userState.clustering, ...session.clustering };
		}

		if (session.glbBlob) {
			userState.ui.glbBlob = session.glbBlob;
			userState.ui.modelUrl = URL.createObjectURL(session.glbBlob);
		}

		userState.ui.activeDraftId = id;
		userState.ui.workspace = topo.editorMode === '2d' ? 'topos/2d/editor' : 'topos/3d/editor';
	}

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

	// --- Auto-save logic ---
	let saveTimeout;
	$effect(() => {
		if (!canAutosave) return;

		const topoString = JSON.stringify({
			routes: userState.topo.routes,
			fixPoints: userState.topo.fixPoints,
			outlines: userState.topo.outlines,
			textLabels: userState.topo.textLabels,
			image2D: userState.topo.image2D,
			name: userState.topo.name,
			crag_id: userState.topo.crag_id,
			sector_id: userState.topo.sector_id,
			clustering: userState.clustering,
			glbBlob: userState.ui.glbBlob,
			modelRevision: userState.ui.modelRevision
		});

		if (topoString) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(async () => {
				if (isBlankTopoSession()) return;

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

	function slugifyName(value, fallback = 'topo') {
		return (value || fallback).trim().toLowerCase().replace(/\s+/g, '-');
	}

	function pathBasename(path = '') {
		return String(path).split('/').filter(Boolean).at(-1) || '';
	}

	function getExportNames(savePath) {
		if (userState.topo._topoFileName) {
			const topoFileName = userState.topo._topoFileName.endsWith('.json')
				? userState.topo._topoFileName
				: `${userState.topo._topoFileName}.json`;
			return {
				baseName: topoFileName.replace(/-topo\.json$/i, '').replace(/\.json$/i, ''),
				topoFileName
			};
		}

		const baseName = pathBasename(savePath) || slugifyName(userState.topo.name);
		return { baseName, topoFileName: `${baseName}-topo.json` };
	}

	async function combinedExport() {
		// Require authentication
		if (!authState.requireAuth(() => combinedExport())) return;

		// Require a save path
		let savePath = userState.topo._entryPath;
		if (!savePath) {
			saveStatus = 'error';
			saveError = 'No save path set. Set it in the Properties panel.';
			return;
		}
		saveStatus = 'saving';
		saveError = '';

		try {
			if (userState.topo.editorMode === '3d' && modelComponent) {
				await modelComponent.bakeTransforms();
			}

			userState.topo.date = userState.topo.date || new Date().toISOString().split('T')[0];
			userState.topo.updated = new Date().toISOString().split('T')[0];

			const { baseName, topoFileName } = getExportNames(savePath);
			let topoToSave = JSON.parse(JSON.stringify(userState.topo));

			// Remove internal UI fields before saving
			delete topoToSave._entryPath;
			delete topoToSave._topoFileName;

			if (workspace === '3d-create') {
				// Convert visible clusters to fixPoints
				const confirmedBolts = userState.clustering.clusters.map(c => ({
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
			await writeJson(`${savePath}/${topoFileName}`, topoToSave);

			// Upload GLB model if available (3D mode)
			if (userState.topo.editorMode === '3d' && userState.ui.glbBlob) {
				await writeFile(
					`${savePath}/${baseName}.glb`,
					userState.ui.glbBlob,
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

	let editor2D = $state();
</script>

<div
	class="fixed top-2 left-2 right-2 z-50 {userState.topo.editorMode === '2d'
		? 'hidden md:block'
		: 'block'}"
>
	{#if userState.topo.editorMode === '3d'}
		<div class="panel p-1.5 flex items-center justify-between shadow-panel bg-white">
			<div class="flex items-center gap-2.5">
				<button
					class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5"
					onclick={() => goto(base + '/')}
					title={$_('ui.back_to_launcher')}
				>
					<i class="fa-solid fa-arrow-left text-[11px]"></i>
				</button>
				<div class="ml-1 mr-3 hidden sm:block">
					<h1 class="text-section-title leading-none">{$_('ui.3d_studio')}</h1>
				</div>
				<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

				<div class="flex items-center gap-1">
					{#if workspace.includes('3d') && (workspace.includes('create') || userState.clustering.rawHits.length > 0)}
						<button
							class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'ai-bolts' ? 'bg-creator-blue text-white shadow-sm' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
							onclick={() => {
								activeTool = 'ai-bolts';
								drawingTarget = null;
							}}
							title={$_('ui.ai-bolts')}
						>
							<i class="fa-solid fa-wand-magic-sparkles"></i><span class="hidden md:inline"
						>{$_('ui.ai-bolts')}</span
						>
						</button>
					{/if}
					<button
						class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'route' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => {
							activeTool = 'route';
							drawingTarget = null;
						}}
						title={$_('ui.route')}
					>
						<i class="fa-solid fa-route"></i><span class="hidden md:inline">{$_('ui.route')}</span>
					</button>
					<button
						class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'multipitch' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => {
							activeTool = 'multipitch';
							drawingTarget = null;
						}}
						title={$_('ui.multipitch')}
					>
						<i class="fa-solid fa-timeline"></i><span class="hidden md:inline"
					>{$_('ui.multipitch')}</span
					>
					</button>
					<button
						class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'fixpoint' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => {
							activeTool = 'fixpoint';
							drawingTarget = null;
						}}
						title={$_('ui.fixpoint')}
					>
						<i class="fa-solid fa-circle-dot"></i><span class="hidden md:inline"
					>{$_('ui.fixpoint')}</span
					>
					</button>
					<button
						class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'crop' ? 'bg-creator-blue text-white shadow-sm' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => {
							activeTool = 'crop';
							drawingTarget = null;
							lassoPoints = [];
						}}
						title={$_('ui.crop')}
					>
						<i class="fa-solid fa-scissors"></i><span class="hidden md:inline">{$_('ui.crop')}</span
					>
					</button>
				</div>

				<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

				<label
					class="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-black/5 cursor-pointer group transition-none"
				>
					<input
						type="checkbox"
						bind:checked={userState.clustering.showCameraTrail}
						class="w-3 h-3 rounded-sm border border-black/15 text-creator-blue focus:ring-1 focus:ring-creator-blue transition-none"
					/>
					<span class="text-ui-label text-warm-gray-500 group-hover:text-near-black transition-none"
					>{$_('ui.show_camera_trail')}</span
					>
				</label>
			</div>

			<div class="flex items-center gap-4 pr-1">
				<SaveStatus status={saveStatus} errorMessage={saveError} />
				<button
					class="bg-creator-blue text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-creator-blue-active transition-none uppercase tracking-widest"
					onclick={combinedExport}
					disabled={saveStatus === 'saving'}
				>
					{$_('save.save_to_server')}
				</button>
			</div>
		</div>
	{:else}
		<div class="hidden md:block">
			<ToolPalette2D
				bind:activeTool
				bind:selectedSymbol={userState.ui.selectedSymbol}
				bind:selectedOutlineStyle
				{hasPendingChanges}
				onFinishRoute={handleFinishRoute}
				onCancelAction={handleCancelAction}
				onUndo={() => editor2D?.undo()}
				onRedo={() => editor2D?.redo()}
				onExport={combinedExport}
				status={saveStatus}
				errorMessage={saveError}
			/>
		</div>
	{/if}
</div>

<!-- Floating Hint Panels for 3D Mode -->
{#if userState.topo.editorMode === '3d' && activeTool && activeTool !== 'ai-bolts'}
	<div
		class="fixed top-14 left-2 flex items-center gap-3 p-1.5 bg-white rounded-sm border border-black/15 shadow-modal z-100"
	>
		<div class="px-2 py-0.5 border-r border-black/10">
			<p class="text-ui-label text-near-black m-0!">{$_(`ui.${activeTool}`)}</p>
		</div>
		<div class="flex items-center gap-4 px-1 text-warm-gray-500">
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
	</div>
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
	{#if userState.topo.editorMode === '3d' && activeTool === 'ai-bolts'}
		{@render children?.()}
	{/if}
</div>

{#if userState.topo.editorMode === '3d' && activeTool === 'ai-bolts' && (workspace.includes('create') || workspace === 'topos/3d/editor' || userState.clustering.rawHits.length > 0)}
	<HitInspector />
{/if}

<div class="md:hidden">
	{#if userState.topo.editorMode === '2d'}
		<ToolPalette2D
			bind:activeTool
			bind:selectedSymbol={userState.ui.selectedSymbol}
			bind:selectedOutlineStyle
			{hasPendingChanges}
			onFinishRoute={handleFinishRoute}
			onCancelAction={handleCancelAction}
			onUndo={() => editor2D?.undo()}
			onRedo={() => editor2D?.redo()}
			onExport={combinedExport}
		/>
	{/if}
</div>

{#if browser && userState.topo.editorMode === '2d' && ['route', 'multipitch', 'outline'].includes(activeTool)}
	<div class="fixed bottom-16 left-2 right-2 z-101 md:bottom-auto md:right-auto md:top-25">
		<OutlineToolOptions
			outlineTool={editor2D?.getCurrentTool?.()}
			{activeTool}
			bind:selectedOutlineStyle
			onFinalize={handleFinishRoute}
			onCancelAction={handleCancelAction}
			onClose={() => (activeTool = null)}
		/>
	</div>
{/if}

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	{#if userState.topo.editorMode === '2d'}
		<Topo2DEditor
			bind:this={editor2D}
			bind:activeTool
			bind:drawingTarget
			selectedSymbol={userState.ui.selectedSymbol}
			{selectedOutlineStyle}
			bind:hasPendingChanges
		/>
	{:else}
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
	{/if}
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

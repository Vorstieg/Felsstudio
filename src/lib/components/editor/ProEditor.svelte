<script lang="ts">
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Mesh, MeshStandardMaterial, Vector3, WebGLRenderer } from 'three';
	import type { Group } from 'three';
	import type { OrbitControls as OrbitControlsInstance } from 'three/examples/jsm/controls/OrbitControls.js';
	import { createGltfLoader } from '$lib/assets/js/gltf-loader.ts';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	import Model from '$lib/components/editor/EditorModel.svelte';
	import EditorInternal from '$lib/components/editor/3d/EditorInternal.svelte';
	import MapModal from '$lib/components/ui/MapModal.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import HitInspector from '$lib/components/editor/HitInspector.svelte';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import { isBlankTopoSession } from '$lib/state/drafts.svelte.ts';
	import { useTopoDraftAutosave } from '$lib/components/editor/use-topo-draft-autosave.svelte.ts';

	// 2D Editor imports

	import { generateSymbolId, initializeIdCounters } from '$lib/assets/js/id-utils.ts';
	import { writeFile, writeJson } from '$lib/api/felslager.ts';
	import { resolveTopoSavePath } from '$lib/assets/js/topo-save-path.ts';
	import { authState } from '$lib/api/auth.svelte.ts';
	import ToolPalette3D from '$lib/components/editor/3d/ToolPalette3D.svelte';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import { fixpointSymbols } from '@vorstieg/topo-renderer';
	import {
		loadTopoEditorEntry,
		persistTopoSessionImmediately
	} from '$lib/assets/js/open-topo-editor-entry.ts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { DraftSession } from '$lib/state/draft-serialization.ts';
	import type { Topo2DEditorDocument } from '$lib/state/topo-2d-editor-initial-state.ts';
	import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';

	type Point3 = [number, number, number];
	type Point2 = [number, number];
	type Props = { workspace?: string; entryPath?: string | null; children?: Snippet };

	let { workspace = '3d-create', entryPath = null, children }: Props = $props();
	const initialEntryPath = untrack(() => entryPath);
	const topoSession = provideTopo2DEditorState(createTopo2DEditorState());
	let saveStatus = $state<'idle' | 'success' | 'error'>('idle');
	let saveError = $state('');

	function getInitialActiveTool() {
		return topoSession.clustering.rawHits.length > 0 ? 'ai-bolts' : '';
	}

	function getInitialWorkspace() {
		return workspace;
	}

	topoSession.ui.workspace = getInitialWorkspace();

	let activeTool = $state(getInitialActiveTool());
	let modelComponent = $state<ReturnType<typeof Model> | null>(null);
	let editorInternal = $state<ReturnType<typeof EditorInternal> | null>(null);
	let drawingTarget = $state<TopoDrawingTarget | null>(null);

	// Lasso state
	let selectedIndicesMap = $state<Map<string, Set<number>>>(new Map());
	let lassoPoints = $state<Point2[]>([]);
	let isDrawingLasso = $state(false);
	let isShiftPressed = $state(false);

	const createRenderer = (canvas: HTMLCanvasElement) => {
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
		if (!context) throw new Error('WebGL2 is unavailable');

		return new WebGLRenderer({
			canvas,
			context,
			powerPreference: 'high-performance',
			antialias: true,
			precision: 'highp',
			alpha: true
		});
	};

	let element = $state<HTMLDivElement | null>(null);
	let loadedGltfScene = $state<Group | null>(null);
	let showMapModal = $state(false);
	let mapCoordinates = $state<[number, number]>([0, 0]);
	let mapAltitude = $state(0);
	let mapModalWasOpen = false;
	$effect(() => {
		if (showMapModal && !mapModalWasOpen) {
			const [longitude = 0, latitude = 0, elevation = 0] = topoSession.topo.coordinates || [];
			mapCoordinates = [longitude, latitude];
			mapAltitude = elevation;
		}
		mapModalWasOpen = showMapModal;
	});

	function closeMapModal() {
		topoSession.topo.coordinates = [mapCoordinates[0], mapCoordinates[1], mapAltitude];
		showMapModal = false;
	}

	// --- Camera Focus Logic (Svelte Native Animation) ---
	const cameraPosStore = tweened<Point3>([0, 1, 5], {
		duration: 800,
		easing: cubicOut
	});
	const targetPosStore = tweened<Point3>([0, 0, 0], {
		duration: 800,
		easing: cubicOut
	});

	// Derive values for Threlte
	let cameraPosition = $derived($cameraPosStore);
	let controlsTarget = $derived($targetPosStore);

	let controlsRef = $state<OrbitControlsInstance | undefined>();
	let lastSelectedClusterId: string | number | null = null;

	$effect(() => {
		const clusterId = topoSession.clustering.lockedClusterId;
		if (clusterId && clusterId !== lastSelectedClusterId) {
			lastSelectedClusterId = clusterId;
			const cluster = topoSession.clustering.clusters.find((c) => c.id === clusterId);
			if (cluster && cluster.members.length > 0) {
				const offset = topoSession.ui.modelOffset || [0, 0, 0];

				// Calculate Anchor (Target)
				const anchor: Point3 = [
					cluster.anchor[0] + offset[0],
					cluster.anchor[1] + offset[1],
					cluster.anchor[2] + offset[2]
				];
				topoSession.transient.targetControlsTarget = new Vector3(...anchor);

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
				topoSession.transient.targetCameraPosition = anchorVec
					.clone()
					.add(viewDir.multiplyScalar(1.5));

				// Trigger tween
				targetPosStore.set(anchor);
				cameraPosStore.set([
					topoSession.transient.targetCameraPosition.x,
					topoSession.transient.targetCameraPosition.y,
					topoSession.transient.targetCameraPosition.z
				]);
			}
		} else if (!clusterId) {
			lastSelectedClusterId = null;
		}
	});

	// Keep OrbitControls in sync with tween
	$effect(() => {
		if (controlsRef && topoSession.clustering.lockedClusterId) {
			controlsRef.update();
		}
	});

	onMount(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (activeTool === 'crop') {
				if (e.key === 'Delete' || e.key === 'Del') applyLassoCut();
				else if (e.key === 'Escape') resetLasso();
				else if (e.key === 'Shift') isShiftPressed = true;
				else if (e.key === 'c' || e.key === 'C') selectFloating();
			}
		};
		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'Shift') isShiftPressed = false;
		};
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	function restoreSession(session: DraftSession, id: string) {
		topoSession.loadSession(session, id);
		topoSession.ui.editorMode = session.editorMode === '2d' ? '2d' : '3d';
		topoSession.ui.workspace =
			topoSession.ui.editorMode === '2d' ? 'topos/2d/editor' : 'topos/3d/editor';
	}

	useTopoDraftAutosave({
		session: topoSession,
		draftId: browser ? new URL(window.location.href).searchParams.get('draft') : null,
		entryPath: initialEntryPath,
		loadEntrySession: async (entryPath) => {
			const { loadedTopo } = await loadTopoEditorEntry({
				entryPath,
				workspace: '/topos/3d/editor',
				topoSession: topoSession
			});
			if (!loadedTopo) {
				const draftId = await persistTopoSessionImmediately(topoSession, $state.snapshot);
				goto(`${resolve('/topos/3d/upload', {})}?draft=${encodeURIComponent(draftId)}`);
				return false;
			}
		},
		editorMode: '3d',
		getWorkspace: () => workspace,
		shouldRestore: () =>
			!initialEntryPath &&
			(workspace.endsWith('edit') ||
				isBlankTopoSession({
					topo: topoSession.topo,
					clustering: topoSession.clustering,
					glbBlob: topoSession.transient.glbBlob
				})),
		restoreSession: (session, id) => {
			restoreSession(session, id);
			activeTool = getInitialActiveTool();
			initializeIdCounters(topoSession.topo);
		},
		onInitialized: () => {
			initializeIdCounters(topoSession.topo);
			activeTool = getInitialActiveTool();
			if (topoSession.transient.modelUrl) loadGlbFromUrl(topoSession.transient.modelUrl);
		},
		getSaveSignature: () =>
			JSON.stringify({
				routes: topoSession.topo.routes,
				fixPoints: topoSession.topo.fixPoints,
				outlines: topoSession.topo.outlines,
				textLabels: topoSession.topo.textLabels,
				image2D: topoSession.topo.image2D,
				imageAspectRatio: topoSession.topo.imageAspectRatio,
				canvasAspectRatio: topoSession.ui.canvasAspectRatio,
				backgroundFit: topoSession.topo.backgroundFit,
				name: topoSession.ui.name,
				modelOffset: topoSession.ui.modelOffset,
				modelRotation: topoSession.ui.modelRotation,
				modelScale: topoSession.ui.modelScale,
				scale: topoSession.ui.scale,
				clustering: topoSession.clustering,
				glbBlob: topoSession.transient.glbBlob,
				modelRevision: topoSession.transient.modelRevision
			})
	});

	async function loadGlbFromUrl(url: string) {
		const loader = createGltfLoader();
		try {
			const gltf = await loader.loadAsync(url);

			gltf.scene.traverse((child) => {
				if (child instanceof Mesh && child.geometry) {
					if (child.material) {
						const mats = Array.isArray(child.material) ? child.material : [child.material];
						mats.forEach((m) => {
							if (m instanceof MeshStandardMaterial) {
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
		}
	}

	// --- Lasso Handlers ---
	function handleLassoMouseDown(e: PointerEvent) {
		if (activeTool !== 'crop' || !isShiftPressed) return;

		// Capture the pointer to ensure we get move/up events even if we leave the window
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		target.setPointerCapture(e.pointerId);

		isDrawingLasso = true;
		lassoPoints = [[e.clientX, e.clientY]];

		const onMove = (moveEvent: PointerEvent) => {
			if (!isDrawingLasso) return;
			lassoPoints = [...lassoPoints, [moveEvent.clientX, moveEvent.clientY]];
		};

		const onUp = () => {
			if (isDrawingLasso && lassoPoints.length > 2) {
				editorInternal?.previewLassoCut(lassoPoints);
			}
			isDrawingLasso = false;
			lassoPoints = [];
			if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
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

	function estimateGpsOrigin() {
		const pairs: Array<{ glb: Point3; gps: Point3 }> = [];
		const camPositions = topoSession.clustering.cameraPositions;
		const gpsData = topoSession.clustering.gpsData;

		for (const fIdx in camPositions) {
			// Find corresponding GPS entry (handling string keys/frame padding)
			const key = Object.keys(gpsData).find(
				(k) => fIdx.includes(`frame${k.padStart(6, '0')}`) || k === fIdx
			);
			if (key && gpsData[key]) {
				const g = gpsData[key];
				if (g.latitude !== 0 && g.longitude !== 0) {
					pairs.push({
						glb: camPositions[fIdx],
						gps: [g.longitude, g.latitude, g.abs_alt || g.rel_alt || 0]
					});
				}
			}
		}
		if (pairs.length === 0) return null;

		// Origin is at [0,0,0] in GLB space
		const pGlb: Point3 = [0, 0, 0];
		const dist = (p1: Point3, p2: Point3) =>
			Math.sqrt(
				Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2)
			);

		const nearest = pairs
			.map((p) => ({ p, d: dist(pGlb, p.glb) }))
			.sort((a, b) => a.d - b.d)
			.slice(0, 5);

		if (nearest[0].d < 0.001) return nearest[0].p.gps;

		let weightSum = 0;
		const estGps: Point3 = [0, 0, 0];
		nearest.forEach((n) => {
			const w = 1.0 / Math.pow(n.d, 2);
			weightSum += w;
			for (let i = 0; i < 3; i++) estGps[i] += n.p.gps[i] * w;
		});
		return estGps.map((v) => v / weightSum) as Point3;
	}

	async function combinedExport() {
		// Require authentication
		if (!authState.requireAuth(() => combinedExport())) return;

		try {
			if (modelComponent) {
				await modelComponent.bakeTransforms();
			}

			topoSession.topo.date = topoSession.topo.date || new Date().toISOString().split('T')[0];
			topoSession.topo.updated = new Date().toISOString().split('T')[0];

			const topoToSave: Topo2DEditorDocument = JSON.parse(JSON.stringify(topoSession.topo));

			if (workspace === '3d-create') {
				// Convert visible clusters to fixPoints
				const confirmedBolts = topoSession.clustering.clusters.map((c) => ({
					id: generateSymbolId(),
					type: c.class || 'bolt',
					position3D: c.anchor,
					meta: {
						observations: c.members.length,
						confidence: c.conf
					}
				}));
				topoToSave.fixPoints = [...(topoToSave.fixPoints || []), ...confirmedBolts];

				if (topoToSave.coordinates?.[0] === 0 && topoToSave.coordinates[1] === 0) {
					const originGps = estimateGpsOrigin();
					if (originGps) topoToSave.coordinates = originGps;
				}
			}

			// Save topo JSON to Felslager
			const topoFileName = resolveTopoSavePath(topoSession.ui, initialEntryPath);
			if (typeof topoFileName !== 'string' || !topoFileName) {
				throw new Error('Topo file path is unavailable');
			}
			topoSession.ui.topoFileName = topoFileName;
			await writeJson(topoFileName, topoToSave);

			// Upload GLB model if available (3D mode)
			if (topoSession.transient.glbBlob) {
				await writeFile(
					topoFileName.replace(/-topo\.json$/, '.glb'),
					topoSession.transient.glbBlob,
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
			saveError = err instanceof Error ? err.message : String(err);
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
		bind:clustering={topoSession.clustering}
	></ToolPalette3D>
</div>

<!-- Floating Hint Panels for 3D Mode -->
{#if activeTool && activeTool !== 'ai-bolts'}
	<ToolOptions title={$_(`ui.${activeTool}`)} onClose={() => (activeTool = '')}>
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
							class="flex items-center gap-2 h-7 px-2.5 rounded-sm transition-none border {topoSession
								.ui.selectedSymbol === symbol.id
								? 'bg-creator-blue text-white border-creator-blue shadow-sm'
								: 'bg-black/5 text-warm-gray-500 border-black/5 hover:bg-black/10 hover:text-near-black'}"
							onclick={() => (topoSession.ui.selectedSymbol = symbol.id)}
							title={$_(`topo.fixpoints.${symbol.id}`)}
						>
							<img
								src={symbol.icon}
								alt={symbol.name}
								class="w-3 h-3 {topoSession.ui.selectedSymbol === symbol.id
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
		role="presentation"
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

{#if activeTool === 'ai-bolts' && topoSession.clustering.rawHits.length > 0}
	<HitInspector />
{/if}

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div
		id="css-renderer-target"
		bind:this={element}
		style="position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; height: 100%; z-index: 1;"
	></div>
	<Canvas {createRenderer} dpr={browser ? window.devicePixelRatio : 1}>
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
		{#if element !== null}
			<Model
				bind:this={modelComponent}
				gltfScene={loadedGltfScene}
				{activeTool}
				bind:selectedIndicesMap
			>
				<EditorInternal
					bind:this={editorInternal}
					{loadedGltfScene}
					{element}
					bind:selectedIndicesMap
				/>
			</Model>
		{/if}
	</Canvas>
</div>

<TopoPropertiesPanel bind:showMapModal bind:drawingTarget bind:activeTool />

{#if showMapModal}
	<MapModal
		bind:coordinates={mapCoordinates}
		bind:altitude={mapAltitude}
		gltfScene={loadedGltfScene}
		bind:modelRotation={topoSession.ui.modelRotation}
		bind:modelScale={topoSession.ui.modelScale}
		onClose={closeMapModal}
	/>
{/if}

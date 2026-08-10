<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { fileUrl, listDir, readJson } from '$lib/api/felslager.js';
	import { loadAccessCollection } from '$lib/assets/js/fetchCrags.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { createTopoEditorSession, provideTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import { Topo } from '$lib/assets/js/topo-paths.js';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.js';
	import EntryPicker from '$lib/components/editor/wizard/EntryPicker.svelte';
	import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';
	import { createCragEditorSession } from '$lib/state/crag-session.svelte.js';

	let { workspace, titleKey, actionLabelKey, locations = [] } = $props();
	const userState = provideTopoEditorSession(createTopoEditorSession());
	const cragEditorState = createCragEditorSession();

	let isLoading = $state(false);
	let searchQuery = $state('');
	let workSpaceWrapper = $derived(new WorkSpace(workspace));

	let glbFiles = $state(new Set());

	onMount(async () => {
		try {
			const allFiles = await listDir('', { recursive: true });
			glbFiles = new Set(
				allFiles
					.filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith('.glb'))
					.map((f) => f.path)
			);
		} catch (err) {
			console.error('Failed to load file listing from Felslager:', err);
		}
	});

	const filteredLocations = $derived(
		locations.filter((l) => {
			const query = searchQuery.toLowerCase();
			if (query === '') return true;

			const sectors = l.properties?.sectors ?? [];
			const sectorMatch = sectors.some(
				(sector) =>
					(sector.name || '').toLowerCase().includes(query) ||
					(sector.id || '').toLowerCase().includes(query) ||
					(sector.type || []).includes(searchQuery)
			);

			return (
				(l.properties?.name ?? '').toLowerCase().includes(query) ||
				(l.properties?.path ?? '').toLowerCase().includes(query) ||
				sectorMatch
			);
		})
	);


	async function persistTopoSessionImmediately() {
		draftsState.load();
		userState.ui.activeDraftId = await draftsState.save(userState.topo, userState.ui.activeDraftId, {
			clustering: $state.snapshot(userState.clustering),
			glbBlob: userState.transient.glbBlob
		});
		userState.ui.lastSaved = new Date().toISOString();
	}

	async function startNewEntry() {
		if (workSpaceWrapper.isCragEditor()) {
			const [{ storage }, { CRAG_SESSION_KEY }] = await Promise.all([
				import('$lib/assets/js/storage-utils.js'),
				import('$lib/components/editor/crag/crag-editor-options.js')
			]);
			cragEditorState.reset();
			storage.remove(CRAG_SESSION_KEY);
		}

		goto(resolve(workSpaceWrapper.path));
	}

	class WorkSpace {
		constructor(path) {
			this.path = path;
		}

		is2DEditor() {
			return this.path.startsWith('/topos/2d');
		}

		is3DEditor() {
			return this.path.startsWith('/topos/3d');
		}

		isCragEditor() {
			return this.path.startsWith('/crags/');
		}

		isTopoWorkspace() {
			return this.is2DEditor() || this.is3DEditor();
		}
	}

	async function loadFromEntry(crag, sector = null) {
		isLoading = true;
		error = null;
		userState.reset();
		try {
			const topo = new Topo(crag.properties.path, crag.properties.id, sector?.id);
			const name = crag.properties.name;

			let loadedTopo = workSpaceWrapper.is3DEditor() && glbFiles.has(topo.getGlbPath());

			if (workSpaceWrapper.isCragEditor()) {
				cragEditorState.reset();
				try {
					const cragData = await readJson(topo.getCragPath());
					Object.assign(cragEditorState.crag, cragData.properties);
					cragEditorState.crag.geometry = cragData.geometry;
					cragEditorState.crag.sectors = await Promise.all(
						(cragData.properties.sectors || []).map(async (sector) => {
							try {
								const sectorData = await readJson(
									new Topo(topo.path, topo.cragId, sector.id).getSectorPath()
								);
								return {
									...sector,
									...sectorData.properties,
									id: sector.id,
									name: sectorData.properties.name || sector.name,
									geometry: sectorData.geometry
								};
							} catch {
								return sector;
							}
						})
					);
					const topoDocuments = [
						{ sectorId: null, sectorTopo: topo },
						...cragEditorState.crag.sectors.map((sector) => ({
							sectorId: sector.id,
							sectorTopo: new Topo(topo.path, topo.cragId, sector.id)
						}))
					];
					cragEditorState.routeDocuments = (
						await Promise.all(
							topoDocuments.map(async ({ sectorId, sectorTopo }) => {
								try {
									const path = sectorTopo.getTopoPath();
									const normalized = normalizeTopoPaths(await readJson(path));
									return { path, sectorId, data: normalized.data, dirty: normalized.migrated };
								} catch {
									return null;
								}
							})
						)
					).filter(Boolean);
				} catch {
					/* crag file may not exist */
				}
				await loadAccessCollection(topo, cragEditorState);

			} else if (workSpaceWrapper.is2DEditor()) {
				try {
					userState.topo = { ...userState.topo, ...normalizeTopoPaths(await readJson(topo.getTopoPath())).data };
				} catch {
					/* no topo yet */
				}
				userState.topo.editorMode = '2d';
			} else {
				try {
					const topoData = normalizeTopoPaths(await readJson(topo.getTopoPath())).data;
					userState.topo = { ...userState.topo, ...topoData };
					loadedTopo = workspace === 'topos/3d/editor' ? loadedTopo : true;
					initializeIdCounters(userState.topo);
				} catch {
					/* no topo yet */
				}
				if (workspace.includes('/3d/')) {
					userState.topo.editorMode = '3d';
					const glbUrl = fileUrl(topo.getGlbPath());
					try {
						const res = await fetch(glbUrl);
						if (res.ok) {
							loadedTopo = workspace === 'topos/3d/editor' ? true : loadedTopo;
							const blob = await res.blob();
							await loadGlbIntoEditorState(new File([blob], `${topo.getBaseName()}.glb`), userState);
						}
					} catch {
						/* GLB may not exist */
					}
				} else {
					userState.topo.editorMode = '2d';
					// Try to load 2D image from Felslager
					const imgNames = [`${name}.jpg`, `${name}.png`, 'topo.jpg'];
					for (const imgName of imgNames) {
						try {
							const res = await fetch(fileUrl(`${topo.path}/${imgName}`));
							if (res.ok) {
								userState.topo.image2D = fileUrl(`${topo.path}/${imgName}`);
								break;
							}
						} catch {
							/* try next */
						}
					}
				}
			}

			// Store the entry path for saving later
			userState.topo._entryPath = topo._getPath();
			userState.topo._topoFileName = topo.getTopoPath();

			if (workSpaceWrapper.is3DEditor() && !loadedTopo) {
				goto(resolve('/topos/3d/upload'));
				return;
			}

			await persistTopoSessionImmediately();
			if (workSpaceWrapper.isCragEditor()) {
				const [{ storage }, { CRAG_SESSION_KEY }] = await Promise.all([
					import('$lib/assets/js/storage-utils.js'),
					import('$lib/components/editor/crag/crag-editor-options.js')
				]);
				storage.set(CRAG_SESSION_KEY, {
					crag: $state.snapshot(cragEditorState.crag),
					access: $state.snapshot(cragEditorState.access),
					routeDocuments: $state.snapshot(cragEditorState.routeDocuments),
					updated: new Date().toISOString()
				});
			}
			goto(`${resolve(workSpaceWrapper.path)}?draft=${encodeURIComponent(userState.ui.activeDraftId)}`);
		} catch (err) {
			console.error(err);
			error = 'Failed to load entry: ' + err.message;
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-xl w-full mt-20">
		<div class="panel overflow-hidden">
			<div class="p-4 border-b border-black/15 bg-white flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						onclick={() => goto(resolve("/"))}
						class="w-8 h-8 rounded border border-transparent hover:border-black/15 hover:bg-black/5 flex items-center justify-center text-near-black transition-none"
						title={$_('ui.back_to_launcher')}
					>
						<i class="fa-solid fa-arrow-left"></i>
					</button>
					<div>
						<h2 class="text-section-title leading-none">{$_(titleKey)}</h2>
						<p class="text-micro-data text-creator-blue mt-0.5">
							{$_('ui.workspace_label')}: {$_(actionLabelKey)}
						</p>
					</div>
				</div>
			</div>

			<div class="p-5 bg-white">
				<EntryPicker
					{workSpaceWrapper}
					{filteredLocations}
					{isLoading}
					bind:searchQuery
					{startNewEntry}
					{loadFromEntry}
				/>
			</div>
		</div>
	</div>
</div>

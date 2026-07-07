<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { createGltfLoader } from '$lib/assets/js/gltf-loader.js';
	import { Box3, Vector3 } from 'three';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { generate2DFromTopo } from '$lib/assets/js/topo-projection.js';
	import { parseRegistrationCsv, projectHits } from '$lib/assets/js/hit-projection.js';
	import {
		getGeometryCenter,
		getSectorEntryPath,
		pathBasename,
		pathDirname
	} from '$lib/assets/js/sector-utils.js';
	import JSZip from 'jszip';
	import { listDir, readJson, fileUrl } from '$lib/api/felslager.js';

	let { workspace, onComplete, locations = [] } = $props();

	let isLoading = $state(false);
	let error = $state(null);
	let searchQuery = $state('');
	let expandedCragPath = $state(null);
	let selectedCreateEntry = $state(false);

	// Files state
	let glbFile = $state(null);
	let projectFile = $state(null);
	let zipFile = $state(null);
	let jsonFile = $state(null);
	let detectionsFile = $state(null);
	let registrationFile = $state(null);
	let gpsFile = $state(null);
	let cropFolderFiles = $state([]);

	// Store the loaded GLTF scene for projection
	let loadedGltfScene = null;

	let topoFiles = $state(new Set());
	let glbFiles = $state(new Set());

	onMount(async () => {
		try {
			const allFiles = await listDir('', { recursive: true });
			const topoPaths = allFiles
				.filter((f) => f.type === 'file' && f.name.endsWith('-topo.json'))
				.map((f) => {
					const parts = f.path.split('/');
					return parts.slice(0, -1).join('/');
				});
			topoFiles = new Set(topoPaths);
			glbFiles = new Set(
				allFiles
					.filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith('.glb'))
					.map((f) => normalizeEntryPath(f.path))
			);
		} catch (err) {
			console.error('Failed to load file listing from Felslager:', err);
		}
	});

	const filteredLocations = $derived(
		locations.filter((l) => {
			const sectors = l.properties.sectors || [];
			const hasTopo =
				topoFiles.has(l.properties.path) ||
				sectors.some((sector) => topoFiles.has(getSectorEntryPath(l.properties.path, sector)));
			let requirementMet = true;

			if (workspace.includes('/edit') && workspace !== 'crags/editor') requirementMet = hasTopo;

			const query = searchQuery.toLowerCase();
			const sectorMatch = sectors.some(
				(sector) =>
					(sector.name || '').toLowerCase().includes(query) ||
					(sector.id || '').toLowerCase().includes(query) ||
					(sector.type || []).includes(searchQuery)
			);
			return (
				requirementMet &&
				(searchQuery === '' ||
					l.properties.name.toLowerCase().includes(query) ||
					l.properties.path.toLowerCase().includes(query) ||
					sectorMatch)
			);
		})
	);

	function isTopoWorkspace() {
		return workspace.startsWith('topos/');
	}

	async function persistTopoSessionImmediately() {
		if (!isTopoWorkspace()) return;

		draftsState.init();
		const id = await draftsState.save(userState.topo, userState.ui.activeDraftId, {
			clustering: $state.snapshot(userState.clustering),
			glbBlob: userState.ui.glbBlob
		});
		userState.ui.activeDraftId = id;
		userState.ui.lastSaved = new Date().toISOString();
	}

	function normalizeEntryPath(path = '') {
		return String(path).replace(/^\/?(src\/)?entries\//, '');
	}

	function getSectorTopoPath(path, sector) {
		const topoAsset = sector?.assets?.topos?.[0];
		if (!topoAsset) return null;
		if (String(topoAsset).includes('/')) return normalizeEntryPath(topoAsset);
		return `${getSectorEntryPath(path, sector)}/${topoAsset}`;
	}

	function slugFromPath(path = '') {
		return path.split('/').filter(Boolean).at(-1) || '';
	}

	function getCragId(crag) {
		const properties = crag.properties || {};
		return properties.id || slugFromPath(properties.path) || properties.name || '';
	}

	function getTopoId(crag, sector = null) {
		const cragId = getCragId(crag);
		return sector?.id ? `${cragId}:${sector.id}` : cragId;
	}

	function getCragDescription(source, cragProperties) {
		return (
			source?.description_de ||
			source?.description_en ||
			cragProperties.description_de ||
			cragProperties.description_en ||
			''
		);
	}

	function seedTopoFromEntry(crag, sector = null) {
		const properties = crag.properties || {};
		const source = sector || properties;
		const coordinates =
			getGeometryCenter(source.geometry) || getGeometryCenter(crag.geometry) || [];
		const today = new Date().toISOString().split('T')[0];

		userState.topo = {
			...userState.topo,
			id: getTopoId(crag, sector),
			name: sector
				? `${properties.name || ''} - ${sector.name || sector.id}`
				: properties.name || '',
			crag_id: getCragId(crag),
			sector_id: sector?.id || '',
			description: getCragDescription(source, properties),
			rock: source.rock_type || properties.rock_type || userState.topo.rock,
			tags: [
				...(properties.tags || []),
				...(properties.type || []),
				...(sector?.tags || []),
				...(sector?.type || [])
			],
			date: properties.date || today,
			updated: today,
			coordinates: [coordinates?.[1] ?? 0, coordinates?.[0] ?? 0]
		};
	}

	async function loadFromEntry(crag, sector = null) {
		isLoading = true;
		error = null;
		userState.reset();
		try {
			const path = crag.properties.path;
			const name = path.split('/').at(-1);
			const entryPath = sector ? getSectorEntryPath(path, sector) : path;
			const sectorTopoPath = getSectorTopoPath(path, sector);
			const entryName = pathBasename(entryPath);
			const topoPath = sectorTopoPath || `${entryPath}/${entryName}-topo.json`;
			const topoDir = pathDirname(topoPath) || entryPath;
			const topoBaseName = pathBasename(topoPath)
				.replace(/-topo\.json$/i, '')
				.replace(/\.json$/i, '');
			const glbPath = normalizeEntryPath(`${topoDir}/${topoBaseName}.glb`);
			const cragJsonPath = `${path}/${name}.json`;
			let loadedTopo = workspace === 'topos/3d/editor' && glbFiles.has(glbPath);

			if (workspace.startsWith('crags/')) {
				const { cragEditorState } = await import('$lib/state/crag-editor.svelte.js');
				cragEditorState.reset();
				try {
					const cragData = await readJson(cragJsonPath);
					Object.assign(cragEditorState.crag, cragData.properties);
					cragEditorState.crag.geometry = cragData.geometry;
				} catch {
					/* crag file may not exist */
				}
				cragEditorState.crag.path = path;

				// Load related files (transit, parking, tracks)
				try {
					const dirFiles = await listDir(path);
					for (const f of dirFiles) {
						if (f.type !== 'file' || !f.name.endsWith('.json') || f.name === `${name}.json`)
							continue;
						try {
							const data = await readJson(f.path);
							if (f.name.includes('-transit-track')) {
								cragEditorState.tracks.push({
									id: Math.random().toString(36).substr(2, 9),
									name: data.properties.name || 'Approach Track',
									coordinates: data.geometry.coordinates
								});
							} else if (f.name.includes('-transit')) {
								cragEditorState.transit.push({
									id: Math.random().toString(36).substr(2, 9),
									name: data.properties.name,
									type: data.properties.type || 'bus',
									coordinates: data.geometry.coordinates
								});
							} else if (f.name.includes('-parking')) {
								cragEditorState.parking.push({
									id: Math.random().toString(36).substr(2, 9),
									coordinates: data.geometry.coordinates
								});
							}
						} catch {
							/* skip unreadable files */
						}
					}
				} catch {
					/* directory listing may fail */
				}
			} else if (workspace === 'topos/2d/editor') {
				seedTopoFromEntry(crag, sector);
				try {
					userState.topo = { ...userState.topo, ...(await readJson(topoPath)) };
				} catch {
					/* no topo yet */
				}
				if (!userState.topo.id) userState.topo.id = getTopoId(crag, sector);
				// Load GLB from Felslager
				const glbUrl = fileUrl(glbPath);
				try {
					const res = await fetch(glbUrl);
					if (res.ok) {
						const blob = await res.blob();
						await loadGlb(new File([blob], `${topoBaseName}.glb`));
					}
				} catch {
					/* GLB may not exist */
				}
				generate2DFromTopo(userState.topo);
				userState.topo.editorMode = '2d';
			} else {
				try {
					const topoData = await readJson(topoPath);
					userState.topo = { ...userState.topo, ...topoData };
					loadedTopo = workspace === 'topos/3d/editor' ? loadedTopo : true;
					if (!userState.topo.id) userState.topo.id = getTopoId(crag, sector);
					initializeIdCounters(userState.topo);
				} catch {
					seedTopoFromEntry(crag, sector);
				}
				if (workspace.includes('/3d/')) {
					userState.topo.editorMode = '3d';
					const glbUrl = fileUrl(glbPath);
					try {
						const res = await fetch(glbUrl);
						if (res.ok) {
							loadedTopo = workspace === 'topos/3d/editor' ? true : loadedTopo;
							const blob = await res.blob();
							await loadGlb(new File([blob], `${topoBaseName}.glb`));
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
							const res = await fetch(fileUrl(`${path}/${imgName}`));
							if (res.ok) {
								userState.topo.image2D = fileUrl(`${path}/${imgName}`);
								break;
							}
						} catch {
							/* try next */
						}
					}
				}
			}

			// Store the entry path for saving later
			userState.topo._entryPath = pathDirname(topoPath) || entryPath;
			userState.topo._topoFileName = pathBasename(topoPath);

			if (workspace === 'topos/3d/editor' && !loadedTopo) {
				selectedCreateEntry = true;
				return;
			}

			await persistTopoSessionImmediately();
			onComplete(workspace === 'topos/3d/editor' ? 'topos/3d/editor' : undefined);
		} catch (err) {
			console.error(err);
			error = 'Failed to load entry: ' + err.message;
		} finally {
			isLoading = false;
		}
	}

	async function processFiles() {
		isLoading = true;
		error = null;
		const preserveSeededTopo = workspace === 'topos/3d/editor' && selectedCreateEntry;
		const seededTopo = preserveSeededTopo ? { ...userState.topo } : null;
		userState.reset();
		if (seededTopo) userState.topo = { ...userState.topo, ...seededTopo };
		try {
			if (workspace === 'topos/3d/editor') {
				userState.topo.editorMode = '3d';
				if (zipFile) {
					const zip = await JSZip.loadAsync(zipFile);
					const glbEntry = Object.values(zip.files).find(
						(f) => !f.dir && f.name.toLowerCase().endsWith('.glb')
					);
					if (glbEntry) {
						const glbBlob = await glbEntry.async('blob');
						glbFile = new File([glbBlob], glbEntry.name.split('/').pop());
					}
					const projectEntry = Object.values(zip.files).find(
						(f) =>
							!f.dir &&
							(f.name.toLowerCase().endsWith('project.json') ||
								f.name.toLowerCase().endsWith('-topo.json'))
					);
					if (projectEntry) {
						const projectBlob = await projectEntry.async('blob');
						projectFile = new File([projectBlob], projectEntry.name.split('/').pop());
					}
					const cropEntries = Object.values(zip.files).filter(
						(f) =>
							!f.dir &&
							(f.name.toLowerCase().endsWith('.jpg') ||
								f.name.toLowerCase().endsWith('.jpeg') ||
								f.name.toLowerCase().endsWith('.png') ||
								f.name.toLowerCase().endsWith('.webp'))
					);

					if (cropEntries.length > 0) {
						const cropsMap = {};
						for (const entry of cropEntries) {
							const blob = await entry.async('blob');
							const fileName = entry.name.split('/').pop().split('\\').pop();
							const blobUrl = URL.createObjectURL(blob);
							cropsMap[fileName] = blobUrl;
							cropsMap[fileName.toLowerCase()] = blobUrl;
							cropsMap[entry.name] = blobUrl;
							cropsMap[entry.name.toLowerCase()] = blobUrl;
						}
						userState.clustering.cropsMap = cropsMap;
					}
				}
				if (!glbFile) throw new Error('GLB Model is required');
				await loadGlb(glbFile);
				if (projectFile) {
					const text = await projectFile.text();
					const project = JSON.parse(text);
					userState.clustering.rawHits = (project.hits || []).map((h) => ({
						...h,
						crop: h.crop || h.hit_crop || h.img,
						edge_dist: h.edge_dist ?? 0,
						normal_dot: h.normal_dot ?? 1.0,
						cam_dist: h.cam_dist ?? 1.0
					}));
					const cams = {};
					userState.clustering.rawHits.forEach((h) => {
						const match = h.img?.match(/[fF](\d+)/);
						const fIdx = match ? parseInt(match[1]) : h.img;
						if (fIdx && !cams[fIdx]) cams[fIdx] = h.cam_pos;
					});
					userState.clustering.cameraPositions = cams;
					if (Array.isArray(project.gps)) {
						const gpsMap = {};
						project.gps.forEach((g) => {
							const fIdx = g.frame_index ?? g.img?.match(/[fF](\d+)/)?.[1];
							if (fIdx !== undefined) gpsMap[fIdx] = g;
						});
						userState.clustering.gpsData = gpsMap;
					}
					if (project.name) userState.topo.name = project.name;
					if (cropFolderFiles && cropFolderFiles.length > 0) {
						const cropsMap = { ...(userState.clustering.cropsMap || {}) };
						for (const file of cropFolderFiles) {
							const blobUrl = URL.createObjectURL(file);
							cropsMap[file.name] = blobUrl;
							cropsMap[file.name.toLowerCase()] = blobUrl;
						}
						userState.clustering.cropsMap = cropsMap;
					}
				} else {
					if (!detectionsFile) throw new Error('Detections or Project File is required');
					const detText = await detectionsFile.text();
					const detections = JSON.parse(detText);
					let is2D = false;
					if (Array.isArray(detections) && detections.length > 0) {
						is2D = !detections[0].pos;
					} else if (detections.frames && detections.frames.length > 0) {
						const firstDet = detections.frames.find((f) => f.detections && f.detections.length > 0)
							?.detections[0];
						is2D = firstDet && !firstDet.pos;
					}
					if (is2D && registrationFile) {
						const regText = await registrationFile.text();
						userState.clustering.registrationCsv = regText;
						const cameras = parseRegistrationCsv(regText);
						userState.clustering.cameraPositions = Object.fromEntries(
							Object.entries(cameras).map(([idx, cam]) => [idx, cam.center.toArray()])
						);
						if (loadedGltfScene) loadedGltfScene.updateMatrixWorld(true);
						userState.clustering.rawHits = projectHits(detections, cameras, loadedGltfScene);
					} else {
						const hits = Array.isArray(detections) ? detections : detections.hits || [];
						userState.clustering.rawHits = hits.map((h) => ({
							...h,
							crop: h.crop || h.hit_crop || h.img
						}));
						if (detections.camera_positions) {
							userState.clustering.cameraPositions = detections.camera_positions;
						}
					}
				}
				if (gpsFile) await loadGps(gpsFile);
				if (userState.topo.coordinates[0] === 0 && userState.topo.coordinates[1] === 0) {
					const validGpsKeys = Object.keys(userState.clustering.gpsData)
						.filter((k) => {
							const g = userState.clustering.gpsData[k];
							return g && g.latitude !== 0 && g.longitude !== 0;
						})
						.sort((a, b) => parseInt(a) - parseInt(b));
					if (validGpsKeys.length > 0) {
						const midKey = validGpsKeys[Math.floor(validGpsKeys.length / 2)];
						const midGps = userState.clustering.gpsData[midKey];
						if (midGps) {
							userState.topo.coordinates = [midGps.latitude, midGps.longitude];
							userState.topo.altitude = midGps.abs_alt || midGps.rel_alt || 0;
						}
					}
				}
			} else if (workspace === 'topos/3d/editor') {
				if (!glbFile) throw new Error('GLB is required');
				await loadGlb(glbFile);
				if (jsonFile) await loadTopoJson(jsonFile);
				userState.topo.editorMode = '3d';
			}
			await persistTopoSessionImmediately();
			onComplete(workspace === 'topos/3d/editor' ? 'topos/3d/editor' : undefined);
		} catch (err) {
			console.error(err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	async function loadGlb(file) {
		const loader = createGltfLoader();
		const buffer = await file.arrayBuffer();
		if (userState.ui.modelUrl) URL.revokeObjectURL(userState.ui.modelUrl);
		userState.ui.modelUrl = URL.createObjectURL(file);
		userState.ui.glbBlob = file;
		return new Promise((resolve, reject) => {
			loader.parse(
				buffer,
				'',
				(gltf) => {
					loadedGltfScene = gltf.scene;
					const box = new Box3().setFromObject(gltf.scene);
					if (!box.isEmpty()) {
						const c = new Vector3();
						box.getCenter(c);
						userState.topo.modelOffset = c.clone().negate().toArray();
					}
					resolve();
				},
				reject
			);
		});
	}

	async function loadTopoJson(file) {
		const text = await file.text();
		const parsed = JSON.parse(text);
		userState.topo = { ...userState.topo, ...parsed };
		initializeIdCounters(userState.topo);
	}
	async function loadGps(file) {
		const text = await file.text();
		const parsed = JSON.parse(text);
		userState.clustering.gpsData = parsed;
	}
</script>

<div class="space-y-4">
	{#if selectedCreateEntry && workspace === 'topos/3d/editor'}
		<div class="space-y-4">
			<button
				class="text-ui-label text-warm-gray-500 hover:text-creator-blue transition-none"
				onclick={() => (selectedCreateEntry = false)}
			>
				<i class="fa-solid fa-arrow-left mr-1"></i>{$_('ui.back_to_launcher')}
			</button>

			<div class="space-y-3">
				<div class="p-3 border border-creator-blue/30 bg-creator-blue/5 rounded">
					<div class="flex items-center gap-2 mb-2">
						<i class="fa-solid fa-file-zipper text-creator-blue text-[11px]"></i>
						<p class="text-ui-label text-creator-blue">{$_('ui.zip_bundle_recommendation')}</p>
					</div>
					<label class="block">
						<input
							type="file"
							accept=".zip"
							onchange={(e) => (zipFile = e.target.files[0])}
							class="block w-full text-body-text text-near-black file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-black/15 file:text-ui-label file:bg-white hover:file:bg-black/5 file:transition-none file:cursor-pointer"
						/>
					</label>
				</div>

				<div class="flex items-center gap-3">
					<div class="h-px flex-1 bg-black/10"></div>
					<span class="text-micro-data text-warm-gray-400">{$_('ui.or')}</span>
					<div class="h-px flex-1 bg-black/10"></div>
				</div>

				<div class="grid grid-cols-1 gap-2">
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.glb_model')}</label>
						<input
							type="file"
							accept=".glb"
							onchange={(e) => (glbFile = e.target.files[0])}
							class="input-studio w-full file:hidden cursor-pointer"
						/>
					</div>
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.project_json')}</label>
						<input
							type="file"
							accept=".json"
							onchange={(e) => (projectFile = e.target.files[0])}
							class="input-studio w-full file:hidden cursor-pointer"
						/>
					</div>
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.crops_directory')}</label>
						<input
							type="file"
							multiple
							webkitdirectory
							directory
							onchange={(e) => (cropFolderFiles = Array.from(e.target.files))}
							class="input-studio w-full file:hidden cursor-pointer"
						/>
					</div>
				</div>
			</div>

			<button onclick={processFiles} disabled={isLoading} class="btn-primary w-full mt-2">
				{#if isLoading}
					<i class="fa-solid fa-spinner fa-spin mr-2"></i> {$_('ui.initializing')}
				{:else}
					{$_('ui.launch_workspace')}
				{/if}
			</button>
		</div>
	{:else if workspace.includes('/edit') || workspace === 'topos/2d/editor' || workspace === 'topos/3d/editor'}
		<div class="space-y-3">
			{#if workspace === 'crags/editor'}
				<button class="btn-primary w-full" onclick={() => onComplete('crags/editor')}>
					<i class="fa-solid fa-plus mr-2"></i>{$_('ui.new_crag')}
				</button>
			{/if}
			<div class="relative">
				<i
					class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray-300 text-[11px]"
				></i>
				<input
					type="text"
					placeholder={$_('ui.search_crags')}
					bind:value={searchQuery}
					class="input-studio w-full !pl-8"
				/>
			</div>
			<div class="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar relative">
				{#if isLoading}
					<div
						class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded"
					>
						<div class="flex flex-col items-center gap-2">
							<i class="fa-solid fa-spinner fa-spin text-creator-blue text-xl"></i>
							<span class="text-micro-data font-bold text-near-black uppercase tracking-widest"
								>{$_('ui.initializing')}</span
							>
						</div>
					</div>
				{/if}
				{#each filteredLocations as crag}
					{@const sectors = crag.properties.sectors || []}
					{@const showSectorChoices = isTopoWorkspace() && sectors.length > 0}
					<div
						class="bg-white rounded border border-transparent hover:border-black/15 transition-none"
					>
						<button
							class="w-full p-2.5 text-left hover:bg-black/5 rounded transition-none group flex items-center justify-between disabled:opacity-50"
							onclick={() =>
								showSectorChoices
									? (expandedCragPath =
											expandedCragPath === crag.properties.path ? null : crag.properties.path)
									: loadFromEntry(crag)}
							disabled={isLoading}
						>
							<div>
								<div class="text-body-text font-bold group-hover:text-creator-blue transition-none">
									{crag.properties.name}
								</div>
								<div class="text-micro-data text-warm-gray-400">{crag.properties.path}</div>
							</div>
							<i
								class="fa-solid {showSectorChoices && expandedCragPath === crag.properties.path
									? 'fa-chevron-down'
									: 'fa-chevron-right'} text-warm-gray-300 text-[10px] group-hover:text-creator-blue transition-none"
							></i>
						</button>
						{#if showSectorChoices && expandedCragPath === crag.properties.path}
							<div class="border-t border-black/10 p-1.5 space-y-1 bg-warm-white/70">
								<button
									class="w-full px-2 py-1.5 rounded-sm text-left text-body-text bg-white border border-black/10 hover:border-creator-blue hover:text-creator-blue transition-none disabled:opacity-50"
									onclick={() => loadFromEntry(crag)}
									disabled={isLoading}
								>
									<span class="font-bold">{crag.properties.name}</span>
									<span class="block text-micro-data text-warm-gray-400">Whole crag</span>
								</button>
								{#each sectors as sector}
									<button
										class="w-full px-2 py-1.5 rounded-sm text-left text-body-text bg-white border border-black/10 hover:border-creator-blue hover:text-creator-blue transition-none disabled:opacity-50"
										onclick={() => loadFromEntry(crag, sector)}
										disabled={isLoading}
									>
										<span class="font-bold">{sector.name || sector.id}</span>
										<span class="block text-micro-data text-warm-gray-400"
											>{sector.assets?.topos?.[0] || 'No topo asset'}</span
										>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="text-center py-6 text-body-text text-warm-gray-500">
						{$_('ui.no_entries_found')}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if error}<div
			class="p-2 bg-rose-50 text-rose-700 rounded text-body-text font-medium border border-rose-200 flex items-center gap-2"
		>
			<i class="fa-solid fa-triangle-exclamation text-rose-500"></i>
			{error}
		</div>{/if}
</div>

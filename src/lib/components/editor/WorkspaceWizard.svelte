<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { userState } from '$lib/state/editor.svelte.js';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { Box3, Vector3 } from 'three';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { generate2DFromTopo } from '$lib/assets/js/topo-projection.js';
	import { parseRegistrationCsv, projectHits } from '$lib/assets/js/hit-projection.js';
	import JSZip from 'jszip';

	let { workspace, onComplete, locations = [] } = $props();

	let isLoading = $state(false);
	let error = $state(null);
	let loadMode = $state('entry'); 
	let searchQuery = $state('');

	// Files state
	let glbFile = $state(null);
	let projectFile = $state(null);
	let zipFile = $state(null);
	let jsonFile = $state(null);
    let extraJsonFiles = $state([]); // For multiple crag files
	let detectionsFile = $state(null);
	let registrationFile = $state(null);
	let gpsFile = $state(null);
	let cropFolderFiles = $state([]);
	let imageFile = $state(null);

	// Store the loaded GLTF scene for projection
	let loadedGltfScene = null;

	let topoFiles = $state(new Set());
	let glbFiles = $state(new Set());

    onMount(async () => {
        // Default modes for new paths
        if (workspace === 'crags/new') loadMode = 'file';

		const topoGlob = import.meta.glob('/src/entries/**/*-topo.json');
		const topoPaths = Object.keys(topoGlob).map(p => p.split('/').slice(3, -1).join('/'));
		topoFiles = new Set(topoPaths);

        const glbGlob = import.meta.glob('/src/entries/**/*.glb');
        const glbPaths = Object.keys(glbGlob).map(p => p.split('/').slice(3, -1).join('/'));
        glbFiles = new Set(glbPaths);
	});

	const filteredLocations = $derived(
		locations.filter(l => {
            const hasTopo = topoFiles.has(l.properties.path);
            const hasGlb = glbFiles.has(l.properties.path);
            let requirementMet = true;
            
            if (workspace === 'topos/2d/new') requirementMet = hasGlb;
            else if (workspace.includes('/edit') && workspace !== 'crags/edit') requirementMet = hasTopo;
            
			return requirementMet && (searchQuery === '' || l.properties.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.properties.path.toLowerCase().includes(searchQuery.toLowerCase()));
		})
	);

	async function loadFromEntry(crag) {
		isLoading = true; error = null; userState.reset();
		try {
			const path = crag.properties.path;
			const name = path.split('/').at(-1);
			const jsonFiles = import.meta.glob('/src/entries/**/*.json');
			const topoPath = `/src/entries/${path}/${name}-topo.json`;
			const cragPath = `/src/entries/${path}/${name}.json`;
            
            if (workspace.startsWith('crags/')) {
                const { cragEditorState } = await import('$lib/state/crag-editor.svelte.js');
                cragEditorState.reset();
                if (jsonFiles[cragPath]) {
                    const cragData = (await jsonFiles[cragPath]()).default;
                    Object.assign(cragEditorState.crag, cragData.properties);
                    cragEditorState.crag.geometry = cragData.geometry;
                }
                const dir = `/src/entries/${path}/`;
                const relatedPaths = Object.keys(jsonFiles).filter(p => p.startsWith(dir));
                for (const rPath of relatedPaths) {
                    if (rPath === cragPath) continue;
                    const data = (await jsonFiles[rPath]()).default;
                    if (rPath.endsWith('-transit.json')) cragEditorState.transit.push({ id: Math.random().toString(36).substr(2, 9), name: data.properties.name, type: data.properties.type || 'bus', coordinates: data.geometry.coordinates });
                    else if (rPath.endsWith('-parking.json')) cragEditorState.parking.push({ id: Math.random().toString(36).substr(2, 9), coordinates: data.geometry.coordinates });
                    else if (rPath.endsWith('-transit-track.json')) cragEditorState.tracks.push({ id: Math.random().toString(36).substr(2, 9), name: data.properties.name || 'Approach Track', coordinates: data.geometry.coordinates });
                }
            } else if (workspace === 'topos/2d/new') {
                if (jsonFiles[topoPath]) userState.topo = { ...userState.topo, ...(await jsonFiles[topoPath]()).default };
                const glbGlob = import.meta.glob('/src/entries/**/*.glb', { query: '?url', import: 'default' });
                const mPath = `/src/entries/${path}/${name}.glb`;
                if (glbGlob[mPath]) { const url = await glbGlob[mPath](); const res = await fetch(url); const blob = await res.blob(); await loadGlb(new File([blob], `${name}.glb`)); }
                generate2DFromTopo(userState.topo); 
                userState.topo.editorMode = '2d';
            } else {
                if (jsonFiles[topoPath]) { userState.topo = { ...userState.topo, ...(await jsonFiles[topoPath]()).default }; initializeIdCounters(userState.topo); }
                if (workspace.includes('/3d/')) {
                    userState.topo.editorMode = '3d';
                    const glbGlob = import.meta.glob('/src/entries/**/*.glb', { query: '?url', import: 'default' });
                    const mPath = `/src/entries/${path}/${name}.glb`;
                    if (glbGlob[mPath]) { const url = await glbGlob[mPath](); const res = await fetch(url); const blob = await res.blob(); await loadGlb(new File([blob], `${name}.glb`)); }
                } else {
                    userState.topo.editorMode = '2d';
                    const imgs = import.meta.glob('/src/entries/**/*.{jpg,jpeg,png,webp}', { query: '?url', import: 'default' });
                    const options = [`/src/entries/${path}/${name}.jpg`, `/src/entries/${path}/${name}.png`, `/src/entries/${path}/topo.jpg` ];
                    for(const p of options) { if (imgs[p]) { userState.topo.image2D = await imgs[p](); break; } }
                }
            }
			onComplete();
		} catch (err) { console.error(err); error = "Failed to load entry: " + err.message; } finally { isLoading = false; }
	}

	async function processFiles() {
		isLoading = true; error = null; userState.reset();
		try {
			if (workspace === 'topos/3d/new') {
                userState.topo.editorMode = '3d';
                    const zip = await JSZip.loadAsync(zipFile);
                    const glbEntry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.glb'));
                    if (glbEntry) {
                        const glbBlob = await glbEntry.async('blob');
                        glbFile = new File([glbBlob], glbEntry.name.split('/').pop());
                    }
                    const projectEntry = Object.values(zip.files).find(f => !f.dir && (f.name.toLowerCase().endsWith('project.json') || f.name.toLowerCase().endsWith('-topo.json')));
                    if (projectEntry) {
                        const projectBlob = await projectEntry.async('blob');
                        projectFile = new File([projectBlob], projectEntry.name.split('/').pop());
                    }
                    const cropEntries = Object.values(zip.files).filter(f => !f.dir && f.name.includes('/crops/') || f.name.startsWith('crops/'));

                    if (cropEntries.length > 0) {
                        const cropsMap = {};
                        for (const entry of cropEntries) {
                            const blob = await entry.async('blob');
                            // Use just the filename to make matching easier
                            const fileName = entry.name.split('/').pop().split('\\').pop();
                            cropsMap[fileName] = URL.createObjectURL(blob);
                            cropsMap[entry.name] = cropsMap[fileName]; // Keep original path just in case
                        }
                        userState.clustering.cropsMap = cropsMap;
                    }
				if (!glbFile) throw new Error('GLB Model is required');
				await loadGlb(glbFile); 
				if (projectFile) {
					const text = await projectFile.text(); const project = JSON.parse(text);
					userState.clustering.rawHits = (project.hits || []).map(h => ({ 
                        ...h, 
                        crop: h.crop || h.hit_crop || h.img,
                        edge_dist: h.edge_dist ?? 0, 
                        normal_dot: h.normal_dot ?? 1.0, 
                        cam_dist: h.cam_dist ?? 1.0 
                    }));
					const cams = {};
					userState.clustering.rawHits.forEach(h => {
						const match = h.img?.match(/[fF](\d+)/);
						const fIdx = match ? parseInt(match[1]) : h.img;
						if (fIdx && !cams[fIdx]) cams[fIdx] = h.cam_pos;
					});
					userState.clustering.cameraPositions = cams;
					if (Array.isArray(project.gps)) {
						const gpsMap = {};
						project.gps.forEach(g => { const fIdx = g.frame_index ?? g.img?.match(/[fF](\d+)/)?.[1]; if (fIdx !== undefined) gpsMap[fIdx] = g; });
						userState.clustering.gpsData = gpsMap;
					}
					if (project.name) userState.topo.name = project.name;
					if (!zipFile && cropFolderFiles && cropFolderFiles.length > 0) {
						const cropsMap = {};
						for (const file of cropFolderFiles) { cropsMap[file.name] = URL.createObjectURL(file); }
						userState.clustering.cropsMap = cropsMap;
					}
				} else {
					if (!detectionsFile) throw new Error('Detections or Project File is required');
					const detText = await detectionsFile.text(); const detections = JSON.parse(detText);
					let is2D = false;
					if (Array.isArray(detections) && detections.length > 0) { is2D = !detections[0].pos; } 
                    else if (detections.frames && detections.frames.length > 0) { const firstDet = detections.frames.find(f => f.detections && f.detections.length > 0)?.detections[0]; is2D = firstDet && !firstDet.pos; }
					if (is2D && registrationFile) {
						const regText = await registrationFile.text(); userState.clustering.registrationCsv = regText;
						const cameras = parseRegistrationCsv(regText);
						userState.clustering.cameraPositions = Object.fromEntries(Object.entries(cameras).map(([idx, cam]) => [idx, cam.center.toArray()]));
						if (loadedGltfScene) loadedGltfScene.updateMatrixWorld(true);
						userState.clustering.rawHits = projectHits(detections, cameras, loadedGltfScene);
					} else {
						const hits = Array.isArray(detections) ? detections : (detections.hits || []);
                        userState.clustering.rawHits = hits.map(h => ({ ...h, crop: h.crop || h.hit_crop || h.img }));
						if (detections.camera_positions) { userState.clustering.cameraPositions = detections.camera_positions; }
					}
				}
				if (gpsFile) await loadGps(gpsFile);
				if (userState.topo.coordinates[0] === 0 && userState.topo.coordinates[1] === 0) {
					const validGpsKeys = Object.keys(userState.clustering.gpsData).filter(k => { const g = userState.clustering.gpsData[k]; return g && g.latitude !== 0 && g.longitude !== 0; }).sort((a,b) => parseInt(a) - parseInt(b));
					if (validGpsKeys.length > 0) {
						const midKey = validGpsKeys[Math.floor(validGpsKeys.length / 2)];
						const midGps = userState.clustering.gpsData[midKey];
						if (midGps) { userState.topo.coordinates = [midGps.latitude, midGps.longitude]; userState.topo.altitude = midGps.abs_alt || midGps.rel_alt || 0; }
					}
				}
			} else if (workspace === 'topos/3d/edit') {
				if (!glbFile) throw new Error('GLB is required');
				await loadGlb(glbFile); if (jsonFile) await loadTopoJson(jsonFile);
                userState.topo.editorMode = '3d';
			} else if (workspace === 'topos/2d/new') {
				if (imageFile) { await loadImage(imageFile); } 
                else if (glbFile && jsonFile) { await loadGlb(glbFile); await loadTopoJson(jsonFile); generate2DFromTopo(userState.topo); } 
                else { throw new Error('Please provide either an image or 3D assets'); }
                userState.topo.editorMode = '2d';
			} else if (workspace === 'topos/2d/edit') {
				if (!imageFile || !jsonFile) throw new Error('Image and Topo JSON are required');
				await loadImage(imageFile); await loadTopoJson(jsonFile);
                userState.topo.editorMode = '2d';
			} else if (workspace.startsWith('crags/')) {
                const { cragEditorState } = await import('$lib/state/crag-editor.svelte.js');
                cragEditorState.reset();
                const allFiles = [...(jsonFile ? [jsonFile] : []), ...extraJsonFiles];
                if (workspace === 'crags/edit' && allFiles.length === 0 && loadMode === 'file') throw new Error('At least one Crag JSON file is required');
                for (const file of allFiles) {
                    const text = await file.text(); const data = JSON.parse(text);
                    const n = file.name.toLowerCase();
                    if (n.endsWith('-transit.json')) cragEditorState.transit.push({ id: Math.random().toString(36).substr(2, 9), name: data.properties?.name || 'Station', type: data.properties?.type || 'bus', coordinates: data.geometry?.coordinates || data.coordinates });
                    else if (n.endsWith('-parking.json')) cragEditorState.parking.push({ id: Math.random().toString(36).substr(2, 9), coordinates: data.geometry?.coordinates || data.coordinates });
                    else if (n.endsWith('-transit-track.json')) cragEditorState.tracks.push({ id: Math.random().toString(36).substr(2, 9), name: data.properties?.name || 'Track', coordinates: data.geometry?.coordinates || data.coordinates });
                    else { Object.assign(cragEditorState.crag, data.properties || data); if (data.geometry) cragEditorState.crag.geometry = data.geometry; }
                }
            }
			onComplete();
		} catch (err) { console.error(err); error = err.message; } finally { isLoading = false; }
	}

	async function loadGlb(file) {
		const loader = new GLTFLoader(); const buffer = await file.arrayBuffer();
		if (userState.ui.modelUrl) URL.revokeObjectURL(userState.ui.modelUrl);
		userState.ui.modelUrl = URL.createObjectURL(file);
        userState.ui.glbBlob = file;
		return new Promise((resolve, reject) => { 
			loader.parse(buffer, '', (gltf) => { 
				loadedGltfScene = gltf.scene;
				const box = new Box3().setFromObject(gltf.scene); 
				if (!box.isEmpty()) { 
					const c = new Vector3(); box.getCenter(c); 
					userState.topo.modelOffset = c.clone().negate().toArray(); 
				} 
				resolve(); 
			}, reject); 
		});
	}

	async function loadTopoJson(file) { const text = await file.text(); const parsed = JSON.parse(text); userState.topo = { ...userState.topo, ...parsed }; initializeIdCounters(userState.topo); }
	async function loadGps(file) { const text = await file.text(); const parsed = JSON.parse(text); userState.clustering.gpsData = parsed; }
	async function loadImage(file) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { userState.topo.image2D = e.target.result; resolve(); }; reader.readAsDataURL(file); }); }
</script>

<div class="space-y-4">
	{#if workspace !== 'crags/new' && (workspace.includes('/edit') || workspace === 'topos/2d/new')}
		<div class="border border-black/15 rounded p-0.5 flex gap-0.5">
			<button class="flex-1 py-1.5 text-ui-label rounded-sm transition-none {loadMode === 'entry' ? 'bg-white shadow-sm text-creator-blue' : 'text-warm-gray-500 hover:bg-black/5'}" onclick={() => loadMode = 'entry'}>{$_('ui.database')}</button>
			<button class="flex-1 py-1.5 text-ui-label rounded-sm transition-none {loadMode === 'file' ? 'bg-white shadow-sm text-creator-blue' : 'text-warm-gray-500 hover:bg-black/5'}" onclick={() => (loadMode = 'file')}>{$_('ui.local_files')}</button>
		</div>
	{/if}

	{#if loadMode === 'entry' && (workspace.includes('/edit') || workspace === 'topos/2d/new')}
		<div class="space-y-3">
			<div class="relative">
				<i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray-300 text-[11px]"></i>
				<input type="text" placeholder={$_('ui.search_crags')} bind:value={searchQuery} class="input-studio w-full !pl-8" />
			</div>
			<div class="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar relative">
                {#if isLoading}
                    <div class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded">
                        <div class="flex flex-col items-center gap-2">
                            <i class="fa-solid fa-spinner fa-spin text-creator-blue text-xl"></i>
                            <span class="text-micro-data font-bold text-near-black uppercase tracking-widest">{$_('ui.initializing')}</span>
                        </div>
                    </div>
                {/if}
				{#each filteredLocations as crag}
					<button 
                        class="w-full p-2.5 text-left bg-white border border-transparent hover:border-black/15 hover:bg-black/5 rounded transition-none group flex items-center justify-between disabled:opacity-50" 
                        onclick={() => loadFromEntry(crag)}
                        disabled={isLoading}
                    >
						<div>
							<div class="text-body-text font-bold group-hover:text-creator-blue transition-none">{crag.properties.name}</div>
							<div class="text-micro-data text-warm-gray-400">{crag.properties.path}</div>
						</div>
						<i class="fa-solid fa-chevron-right text-warm-gray-300 text-[10px] group-hover:text-creator-blue transition-none"></i>
					</button>
				{:else}
					<div class="text-center py-6 text-body-text text-warm-gray-500">{$_('ui.no_entries_found')}</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			{#if workspace === 'topos/3d/new'}
				<div class="space-y-3">
                    <div class="p-3 border border-creator-blue/30 bg-creator-blue/5 rounded">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fa-solid fa-file-zipper text-creator-blue text-[11px]"></i>
                            <p class="text-ui-label text-creator-blue">{$_('ui.zip_bundle_recommendation')}</p>
                        </div>
                        <label class="block">
                            <input type="file" accept=".zip" onchange={(e) => (zipFile = e.target.files[0])} class="block w-full text-body-text text-near-black file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-black/15 file:text-ui-label file:bg-white hover:file:bg-black/5 file:transition-none file:cursor-pointer" />
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
							<input type="file" accept=".glb" onchange={(e) => (glbFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
						</div>
						<div class="space-y-1">
							<label class="text-ui-label">{$_('ui.project_json')}</label>
							<input type="file" accept=".json" onchange={(e) => (projectFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
						</div>
						<div class="space-y-1">
							<label class="text-ui-label">{$_('ui.crops_directory')}</label>
							<input type="file" multiple webkitdirectory directory onchange={(e) => (cropFolderFiles = Array.from(e.target.files))} class="input-studio w-full file:hidden cursor-pointer" />
						</div>
                    </div>
				</div>
			{:else if workspace === 'topos/3d/edit'}
				<div class="grid grid-cols-1 gap-3">
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.glb_model')} *</label>
						<input type="file" accept=".glb" onchange={(e) => (glbFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
					</div>
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.load_json')} *</label>
						<input type="file" accept=".json" onchange={(e) => (jsonFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
					</div>
				</div>
			{:else if workspace === 'topos/2d/new'}
				<div class="space-y-3">
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.static_image_option')}</label>
						<input type="file" accept="image/*" onchange={(e) => (imageFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
					</div>
					<div class="p-3 border border-black/15 rounded space-y-2">
						<p class="text-ui-label">{$_('ui.projection_3d_option')}</p>
						<input type="file" accept=".glb" onchange={(e) => (glbFile = e.target.files[0])} class="block w-full text-body-text file:mr-2 file:py-1 file:px-2 file:rounded file:border border-black/15 file:text-ui-label file:bg-white hover:file:bg-black/5 file:cursor-pointer" />
						<input type="file" accept=".json" onchange={(e) => (jsonFile = e.target.files[0])} class="block w-full text-body-text file:mr-2 file:py-1 file:px-2 file:rounded file:border border-black/15 file:text-ui-label file:bg-white hover:file:bg-black/5 file:cursor-pointer" />
					</div>
				</div>
			{:else if workspace === 'topos/2d/edit'}
				<div class="grid grid-cols-1 gap-3">
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.image_2d')} *</label>
						<input type="file" accept="image/*" onchange={(e) => (imageFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
					</div>
					<div class="space-y-1">
						<label class="text-ui-label">{$_('ui.load_json')} *</label>
						<input type="file" accept=".json" onchange={(e) => (jsonFile = e.target.files[0])} class="input-studio w-full file:hidden cursor-pointer" />
					</div>
				</div>
			{:else if workspace.startsWith('crags/')}
                <div class="space-y-3">
                    <div class="p-4 border border-black/15 rounded bg-black/5 flex items-center gap-3">
						<i class="fa-solid fa-map-location-dot text-xl text-warm-gray-500"></i>
						<div>
                            <h4 class="text-section-title">{workspace === 'crags/new' ? $_('ui.new_crag') : $_('ui.maintenance')}</h4>
                            <p class="text-body-text text-warm-gray-500">{$_('ui.geospatial_config_desc')}</p>
                        </div>
					</div>
                    {#if workspace === 'crags/edit'}
						<div class="space-y-1">
							<label class="text-ui-label">{$_('ui.crag_json_files')} *</label>
							<input type="file" accept=".json" multiple onchange={(e) => (extraJsonFiles = Array.from(e.target.files))} class="input-studio w-full file:hidden cursor-pointer" />
						</div>
                        {#if extraJsonFiles.length > 0}
							<div class="grid grid-cols-1 gap-1">
								{#each extraJsonFiles as file}
									<div class="text-micro-data text-near-black bg-white px-2 py-1 rounded border border-black/15 flex items-center gap-2">
										<i class="fa-solid fa-file-code text-warm-gray-400"></i> {file.name}
									</div>
								{/each}
							</div>
						{/if}
                    {/if}
                </div>
			{/if}

			{#if error}<div class="p-2 bg-rose-50 text-rose-700 rounded text-body-text font-medium border border-rose-200 flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation text-rose-500"></i> {error}</div>{/if}
			
			<button onclick={processFiles} disabled={isLoading} class="btn-primary w-full mt-2">
				{#if isLoading}
					<i class="fa-solid fa-spinner fa-spin mr-2"></i> {$_('ui.initializing')}
				{:else}
					{$_('ui.launch_workspace')}
				{/if}
			</button>
		</div>
	{/if}
</div>

<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import JSZip from 'jszip';
	import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { createTopo2DEditorState, provideTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	import Topo3DUploadForm from '$lib/components/editor/wizard/Topo3DUploadForm.svelte';

	let isLoading = $state(false);
	const topoSession = provideTopo2DEditorState(createTopo2DEditorState());
	let zipFile = $state(null);
	let glbFile = $state(null);
	let projectFile = $state(null);
	let cropFolderFiles = $state([]);

	async function processFiles() {
		isLoading = true;
		const seededTopo = { ...topoSession.topo };
		topoSession.reset();
		topoSession.topo = { ...topoSession.topo, ...seededTopo, editorMode: '3d' };

		try {
			if (zipFile) {
				const zip = await JSZip.loadAsync(zipFile);
				const entries = Object.values(zip.files);
				const glbEntry = entries.find((file) => !file.dir && file.name.toLowerCase().endsWith('.glb'));
				const projectEntry = entries.find(
					(file) =>
						!file.dir &&
						(file.name.toLowerCase().endsWith('project.json') ||
							file.name.toLowerCase().endsWith('-topo.json'))
				);

				if (glbEntry) {
					glbFile = new File([await glbEntry.async('blob')], glbEntry.name.split('/').pop());
				}
				if (projectEntry) {
					projectFile = new File([await projectEntry.async('blob')], projectEntry.name.split('/').pop());
				}

				const cropsMap = {};
				for (const entry of entries.filter(
					(file) => !file.dir && /\.(jpe?g|png|webp)$/i.test(file.name)
				)) {
					const blobUrl = URL.createObjectURL(await entry.async('blob'));
					const fileName = entry.name.split('/').pop().split('\\').pop();
					cropsMap[fileName] = blobUrl;
					cropsMap[fileName.toLowerCase()] = blobUrl;
					cropsMap[entry.name] = blobUrl;
					cropsMap[entry.name.toLowerCase()] = blobUrl;
				}
				if (Object.keys(cropsMap).length) topoSession.clustering.cropsMap = cropsMap;
			}

			if (!glbFile) throw new Error('GLB Model is required');
			await loadGlbIntoEditorState(glbFile, topoSession);

			if (projectFile) {
				const project = JSON.parse(await projectFile.text());
				topoSession.clustering.rawHits = (project.hits || []).map((hit) => ({
					...hit,
					crop: hit.crop || hit.hit_crop || hit.img,
					edge_dist: hit.edge_dist ?? 0,
					normal_dot: hit.normal_dot ?? 1.0,
					cam_dist: hit.cam_dist ?? 1.0
				}));
				const cameras = {};
				for (const hit of topoSession.clustering.rawHits) {
					const match = hit.img?.match(/[fF](\d+)/);
					const index = match ? parseInt(match[1]) : hit.img;
					if (index && !cameras[index]) cameras[index] = hit.cam_pos;
				}
				topoSession.clustering.cameraPositions = cameras;
				if (Array.isArray(project.gps)) {
					const gpsData = {};
					for (const gps of project.gps) {
						const index = gps.frame_index ?? gps.img?.match(/[fF](\d+)/)?.[1];
						if (index !== undefined) gpsData[index] = gps;
					}
					topoSession.clustering.gpsData = gpsData;
				}
				if (project.name) topoSession.topo.name = project.name;
			}

			if (cropFolderFiles.length) {
				const cropsMap = { ...(topoSession.clustering.cropsMap || {}) };
				for (const file of cropFolderFiles) {
					const blobUrl = URL.createObjectURL(file);
					cropsMap[file.name] = blobUrl;
					cropsMap[file.name.toLowerCase()] = blobUrl;
				}
				topoSession.clustering.cropsMap = cropsMap;
			}

			if (topoSession.topo.coordinates[0] === 0 && topoSession.topo.coordinates[1] === 0) {
				const validGpsKeys = Object.keys(topoSession.clustering.gpsData)
					.filter((key) => {
						const gps = topoSession.clustering.gpsData[key];
						return gps && gps.latitude !== 0 && gps.longitude !== 0;
					})
					.sort((a, b) => parseInt(a) - parseInt(b));
				if (validGpsKeys.length) {
					const gps = topoSession.clustering.gpsData[
						validGpsKeys[Math.floor(validGpsKeys.length / 2)]
					];
					topoSession.topo.coordinates = [gps.latitude, gps.longitude];
					topoSession.topo.altitude = gps.abs_alt || gps.rel_alt || 0;
				}
			}

			draftsState.load();
			topoSession.ui.activeDraftId = await draftsState.save(topoSession.topo, topoSession.ui.activeDraftId, {
				clustering: $state.snapshot(topoSession.clustering),
			glbBlob: topoSession.transient.glbBlob
			});
			topoSession.ui.lastSaved = new Date().toISOString();
			goto(`${resolve('/topos/3d/editor')}?draft=${encodeURIComponent(topoSession.ui.activeDraftId)}`);
		} catch (error) {
			console.error(error);
			alert(error.message);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-xl w-full mt-20">
		<div class="panel overflow-hidden">
			<div class="p-4 border-b border-black/15 bg-white">
				<h2 class="text-section-title leading-none">{$_('ui.3d_studio')}</h2>
			</div>
			<div class="p-5 bg-white">
				<Topo3DUploadForm
					bind:zipFile
					bind:glbFile
					bind:projectFile
					bind:cropFolderFiles
					{isLoading}
					onBack={() => goto(resolve('/topos/3d/select'))}
					onSubmit={processFiles}
				/>
			</div>
		</div>
	</div>
</div>

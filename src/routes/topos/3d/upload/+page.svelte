<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import JSZip from 'jszip';
	import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { userState } from '$lib/state/editor.svelte.js';
	import Topo3DUploadForm from '$lib/components/editor/wizard/Topo3DUploadForm.svelte';

	let isLoading = $state(false);
	let zipFile = $state(null);
	let glbFile = $state(null);
	let projectFile = $state(null);
	let cropFolderFiles = $state([]);

	async function processFiles() {
		isLoading = true;
		const seededTopo = { ...userState.topo };
		userState.reset();
		userState.topo = { ...userState.topo, ...seededTopo, editorMode: '3d' };

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
				if (Object.keys(cropsMap).length) userState.clustering.cropsMap = cropsMap;
			}

			if (!glbFile) throw new Error('GLB Model is required');
			await loadGlbIntoEditorState(glbFile);

			if (projectFile) {
				const project = JSON.parse(await projectFile.text());
				userState.clustering.rawHits = (project.hits || []).map((hit) => ({
					...hit,
					crop: hit.crop || hit.hit_crop || hit.img,
					edge_dist: hit.edge_dist ?? 0,
					normal_dot: hit.normal_dot ?? 1.0,
					cam_dist: hit.cam_dist ?? 1.0
				}));
				const cameras = {};
				for (const hit of userState.clustering.rawHits) {
					const match = hit.img?.match(/[fF](\d+)/);
					const index = match ? parseInt(match[1]) : hit.img;
					if (index && !cameras[index]) cameras[index] = hit.cam_pos;
				}
				userState.clustering.cameraPositions = cameras;
				if (Array.isArray(project.gps)) {
					const gpsData = {};
					for (const gps of project.gps) {
						const index = gps.frame_index ?? gps.img?.match(/[fF](\d+)/)?.[1];
						if (index !== undefined) gpsData[index] = gps;
					}
					userState.clustering.gpsData = gpsData;
				}
				if (project.name) userState.topo.name = project.name;
			}

			if (cropFolderFiles.length) {
				const cropsMap = { ...(userState.clustering.cropsMap || {}) };
				for (const file of cropFolderFiles) {
					const blobUrl = URL.createObjectURL(file);
					cropsMap[file.name] = blobUrl;
					cropsMap[file.name.toLowerCase()] = blobUrl;
				}
				userState.clustering.cropsMap = cropsMap;
			}

			if (userState.topo.coordinates[0] === 0 && userState.topo.coordinates[1] === 0) {
				const validGpsKeys = Object.keys(userState.clustering.gpsData)
					.filter((key) => {
						const gps = userState.clustering.gpsData[key];
						return gps && gps.latitude !== 0 && gps.longitude !== 0;
					})
					.sort((a, b) => parseInt(a) - parseInt(b));
				if (validGpsKeys.length) {
					const gps = userState.clustering.gpsData[
						validGpsKeys[Math.floor(validGpsKeys.length / 2)]
					];
					userState.topo.coordinates = [gps.latitude, gps.longitude];
					userState.topo.altitude = gps.abs_alt || gps.rel_alt || 0;
				}
			}

			draftsState.load();
			userState.ui.activeDraftId = await draftsState.save(userState.topo, userState.ui.activeDraftId, {
				clustering: $state.snapshot(userState.clustering),
				glbBlob: userState.ui.glbBlob
			});
			userState.ui.lastSaved = new Date().toISOString();
			goto(resolve('/topos/3d/editor'));
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

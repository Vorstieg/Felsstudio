<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import JSZip from 'jszip';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.ts';
	import { draftsState } from '$lib/state/drafts.svelte.ts';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import Topo3DUploadForm from '$lib/components/editor/wizard/Topo3DUploadForm.svelte';
	import { parse3DUploadProject } from '$lib/components/editor/wizard/parse-3d-upload-project.ts';

	let isLoading = $state(false);
	const topoSession = provideTopo2DEditorState(createTopo2DEditorState());
	let zipFile = $state<File | null>(null);
	let glbFile = $state<File | null>(null);
	let projectFile = $state<File | null>(null);
	let cropFolderFiles = $state<File[]>([]);

	onMount(async () => {
		const draftId = page.url.searchParams.get('draft');
		if (!draftId) return;
		draftsState.load();
		const session = await draftsState.getById(draftId);
		if (session) topoSession.loadSession(session, draftId);
	});

	async function processFiles() {
		isLoading = true;
		const seededTopo = { ...topoSession.topo };
		topoSession.reset();
		topoSession.topo = { ...topoSession.topo, ...seededTopo };
		topoSession.ui.editorMode = '3d';

		try {
			if (zipFile) {
				const zip = await JSZip.loadAsync(zipFile);
				const entries = Object.values(zip.files);
				const glbEntry = entries.find(
					(file) => !file.dir && file.name.toLowerCase().endsWith('.glb')
				);
				const projectEntry = entries.find(
					(file) =>
						!file.dir &&
						(file.name.toLowerCase().endsWith('project.json') ||
							file.name.toLowerCase().endsWith('-topo.json'))
				);

				if (glbEntry) {
					glbFile = new File(
						[await glbEntry.async('blob')],
						glbEntry.name.split('/').pop() ?? 'model.glb'
					);
				}
				if (projectEntry) {
					projectFile = new File(
						[await projectEntry.async('blob')],
						projectEntry.name.split('/').pop() ?? 'project.json'
					);
				}

				const cropsMap: Record<string, string> = {};
				for (const entry of entries.filter(
					(file) => !file.dir && /\.(jpe?g|png|webp)$/i.test(file.name)
				)) {
					const blobUrl = URL.createObjectURL(await entry.async('blob'));
					const fileName = entry.name.split('/').pop()?.split('\\').pop() ?? entry.name;
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
				const project = parse3DUploadProject(JSON.parse(await projectFile.text()) as unknown);
				topoSession.clustering.rawHits = project.hits;
				const cameras: Record<string, [number, number, number]> = {};
				for (const hit of project.hits) {
					const match = hit.img?.match(/[fF](\d+)/);
					const index = match ? parseInt(match[1]) : hit.img;
					if (index && !cameras[index]) cameras[index] = hit.cam_pos;
				}
				topoSession.clustering.cameraPositions = cameras;
				const gpsData: typeof topoSession.clustering.gpsData = {};
				for (const gps of project.gps) {
					const index = gps.frame_index ?? gps.img?.match(/[fF](\d+)/)?.[1];
					if (index !== undefined) gpsData[index] = gps;
				}
				topoSession.clustering.gpsData = gpsData;
				if (project.name) topoSession.ui.name = project.name;
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

			if (topoSession.topo.coordinates?.[0] === 0 && topoSession.topo.coordinates?.[1] === 0) {
				const validGpsKeys = Object.keys(topoSession.clustering.gpsData)
					.filter((key) => {
						const gps = topoSession.clustering.gpsData[key];
						return gps && gps.latitude !== 0 && gps.longitude !== 0;
					})
					.sort((a, b) => parseInt(a) - parseInt(b));
				if (validGpsKeys.length) {
					const gps =
						topoSession.clustering.gpsData[validGpsKeys[Math.floor(validGpsKeys.length / 2)]];
					topoSession.topo.coordinates = [
						gps.longitude,
						gps.latitude,
						gps.abs_alt || gps.rel_alt || 0
					];
				}
			}

			draftsState.load();
			const { topo, ...extras } = topoSession.getSaveSession();
			topoSession.ui.activeDraftId = await draftsState.save(
				topo,
				topoSession.ui.activeDraftId,
				{
					...extras,
					clustering: $state.snapshot(topoSession.clustering)
				}
			);
			topoSession.ui.lastSaved = new Date().toISOString();
			goto(
				`${resolve('/topos/3d/editor', {})}?draft=${encodeURIComponent(topoSession.ui.activeDraftId)}`
			);
		} catch (error) {
			console.error(error);
			alert(error instanceof Error ? error.message : String(error));
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
					onBack={() => goto(resolve('/topos/3d/select', {}))}
					onSubmit={processFiles}
				/>
			</div>
		</div>
	</div>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import JSZip from 'jszip';
	import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.ts';
	import { useDraftEditor, topoDraftAdapter } from '$lib/components/editor/use-draft-editor.svelte';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import Topo3DUploadForm from '$lib/components/editor/wizard/Topo3DUploadForm.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import {
		getUploadCameraPositions,
		getUploadModelTransform,
		parse3DUploadProject
	} from '$lib/components/editor/wizard/parse-3d-upload-project.ts';

	let isLoading = $state(false);
	let uploadError = $state('');
	const topoSession = provideTopo2DEditorState(createTopo2DEditorState());
	let zipFile = $state<File | null>(null);
	let glbFile = $state<File | null>(null);
	let projectFile = $state<File | null>(null);
	let cropFolderFiles = $state<File[]>([]);

	const draft = useDraftEditor({
		mode: '3d',
		adapter: topoDraftAdapter(topoSession, '3d'),
		resume: false
	});

	async function processFiles() {
		if (!draft.ready) return;
		isLoading = true;
		uploadError = '';
		// Keep the draft ID, document selection, paths, and edits while adding a model.
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

			if (!glbFile) throw new Error($_('editor.glb_model_is_required'));
			await loadGlbIntoEditorState(glbFile, topoSession);

			if (projectFile) {
				const project = parse3DUploadProject(JSON.parse(await projectFile.text()) as unknown);
				topoSession.clustering.rawHits = project.hits;
				topoSession.clustering.cameraPositions = getUploadCameraPositions(project);
				Object.assign(topoSession.ui, getUploadModelTransform(project, topoSession.ui.modelOffset));
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

			await goto(draft.href('topos/3d/editor'));
		} catch (error) {
			console.error(error);
			uploadError = error instanceof Error ? error.message : String(error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex h-screen flex-col items-center overflow-y-auto bg-warm-white p-4 custom-scrollbar">
	<div class="mt-6 w-full max-w-xl md:mt-16">
		<div class="panel overflow-hidden">
			<div class="flex items-center justify-between gap-3 border-b border-black/10 bg-white p-4">
				<h1 class="text-section-title leading-none">{$_('ui.3d_studio')}</h1>
				<LanguageSwitcher compact />
			</div>
			<div class="space-y-3 bg-white p-5">
				{#if draft.error || uploadError}
					<p
						role="alert"
						class="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-body-text text-rose-700"
					>
						{uploadError || draft.error}
					</p>
				{/if}
				<Topo3DUploadForm
					bind:zipFile
					bind:glbFile
					bind:projectFile
					bind:cropFolderFiles
					isLoading={isLoading || !draft.ready}
					onBack={() => goto(resolve('/topos/3d/select', {}))}
					onSubmit={processFiles}
				/>
			</div>
		</div>
	</div>
</div>

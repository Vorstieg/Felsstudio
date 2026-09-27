<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import EntryPicker from '$lib/components/editor/wizard/EntryPicker.svelte';
	import { createCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorPath, getCragEntryPath, getTopoEditorPath } from '$lib/assets/js/editor-entry-paths.ts';
	import { fetchCragsFromManifest } from '$lib/assets/js/fetchCrags.ts';

	type Location = Awaited<ReturnType<typeof fetchCragsFromManifest>>[number];
	type Props = {
		workspace: string;
		titleKey: string;
		actionLabelKey: string;
		locations?: Location[];
	};
	type WorkspacePath = {
		path: string;
		isCragEditor: () => boolean;
		isTopoWorkspace: () => boolean;
	};

	let { workspace, titleKey, actionLabelKey, locations = [] }: Props = $props();
	const cragEditorState = createCragEditorSession();

	let searchQuery = $state('');
	class WorkSpace implements WorkspacePath {
		path: string;

		constructor(path: string) {
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
	let workSpaceWrapper = $derived(new WorkSpace(workspace));

	const filteredLocations = $derived(
		locations.filter((l) => {
			const query = searchQuery.toLowerCase();
			if (query === '') return true;
			return (
				(l.properties?.name ?? '').toLowerCase().includes(query) ||
				getCragEntryPath({ entryPath: l.entryPath }).toLowerCase().includes(query)
			);
		})
	);

	function startNewEntry() {
		if (workSpaceWrapper.isCragEditor()) cragEditorState.reset();
		goto(`${base}${workSpaceWrapper.path}`);
	}

	function loadFromEntry(crag: Location) {
		const path = workSpaceWrapper.isCragEditor()
			? getCragEditorPath({ entryPath: crag.entryPath })
			: getTopoEditorPath(workSpaceWrapper.path, { entryPath: crag.entryPath });
		goto(`${base}${path}`);
	}
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-xl w-full mt-20">
		<div class="panel overflow-hidden">
			<div class="p-4 border-b border-black/15 bg-white flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						onclick={() => goto('/')}
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
					bind:searchQuery
					{startNewEntry}
					{loadFromEntry}
				/>
			</div>
		</div>
	</div>
</div>

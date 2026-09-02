<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EntryPicker from '$lib/components/editor/wizard/EntryPicker.svelte';
	import { createCragEditorSession } from '$lib/state/crag-session.svelte.js';
	import { getCragEditorPath, getTopoEditorPath } from '$lib/assets/js/editor-entry-paths.js';

	let { workspace, titleKey, actionLabelKey, locations = [] } = $props();
	const cragEditorState = createCragEditorSession();

	let searchQuery = $state('');
	let workSpaceWrapper = $derived(new WorkSpace(workspace));

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

	function loadFromEntry(crag, sector = null) {
		const path = workSpaceWrapper.isCragEditor()
			? getCragEditorPath(crag)
			: getTopoEditorPath(workSpaceWrapper.path, crag, sector);
		goto(resolve(path));
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
					bind:searchQuery
					{startNewEntry}
					{loadFromEntry}
				/>
			</div>
		</div>
	</div>
</div>

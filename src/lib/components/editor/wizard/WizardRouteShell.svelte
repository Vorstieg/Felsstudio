<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import EntryPicker from '$lib/components/editor/wizard/EntryPicker.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import { createCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import {
		getCragEditorPath,
		getCragEntryPath,
		getTopoEditorPath
	} from '$lib/assets/js/editor-entry-paths.ts';
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

<div class="flex h-screen flex-col items-center overflow-y-auto bg-warm-white p-4 custom-scrollbar">
	<div class="mt-6 w-full max-w-xl md:mt-16">
		<div class="panel overflow-hidden">
			<div class="flex items-center justify-between gap-3 border-b border-black/10 bg-white p-4">
				<div class="flex min-w-0 items-center gap-3">
					<button
						type="button"
						onclick={() => goto(`${base}/`)}
						class="tool-btn shrink-0"
						title={$_('ui.back_to_launcher')}
						aria-label={$_('ui.back_to_launcher')}
					>
						<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
					</button>
					<div class="min-w-0">
						<h1 class="text-section-title truncate leading-tight">{$_(titleKey)}</h1>
						<p class="text-micro-data mt-0.5 text-creator-blue">
							{$_('ui.workspace_label')}: {$_(actionLabelKey)}
						</p>
					</div>
				</div>
				<LanguageSwitcher compact />
			</div>

			<div class="bg-white p-5">
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

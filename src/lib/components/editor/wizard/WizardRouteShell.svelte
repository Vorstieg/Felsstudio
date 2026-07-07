<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { userState } from '$lib/state/editor.svelte.js';
	import WorkspaceWizard from '$lib/components/editor/WorkspaceWizard.svelte';

	let { workspace, titleKey, actionLabelKey, locations = [] } = $props();

	function getEditorRoute(targetWorkspace) {
		if (targetWorkspace === 'topos/2d' || targetWorkspace?.startsWith('topos/2d/')) {
			return 'topos/2d/editor';
		}
		if (targetWorkspace === 'topos/3d' || targetWorkspace?.startsWith('topos/3d/')) {
			return 'topos/3d/editor';
		}
		if (targetWorkspace?.startsWith('crags/')) return 'crags/editor';
		return targetWorkspace;
	}

	function handleComplete(targetWorkspace = workspace) {
		const editorRoute = getEditorRoute(targetWorkspace);
		userState.ui.workspace = editorRoute;
		goto(`${base}/${editorRoute}`);
	}
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-xl w-full mt-20">
		<div class="panel overflow-hidden">
			<div class="p-4 border-b border-black/15 bg-white flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						onclick={() => goto(`${base}/`)}
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
				<WorkspaceWizard {workspace} {locations} onComplete={handleComplete} />
			</div>
		</div>
	</div>
</div>

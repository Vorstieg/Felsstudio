<script>
	import { _ } from 'svelte-i18n';

	let {
		isLoading = false,
		onBack,
		onSubmit,
		zipFile = $bindable(null),
		glbFile = $bindable(null),
		projectFile = $bindable(null),
		cropFolderFiles = $bindable([])
	} = $props();
</script>

<div class="space-y-4">
	<button
		class="text-ui-label text-warm-gray-500 hover:text-creator-blue transition-none"
		onclick={onBack}
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

	<button onclick={onSubmit} disabled={isLoading} class="btn-primary w-full mt-2">
		{#if isLoading}
			<i class="fa-solid fa-spinner fa-spin mr-2"></i> {$_('ui.initializing')}
		{:else}
			{$_('ui.launch_workspace')}
		{/if}
	</button>
</div>

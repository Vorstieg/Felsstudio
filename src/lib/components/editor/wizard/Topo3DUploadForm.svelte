<script lang="ts">
	import { _ } from 'svelte-i18n';
	type Props = {
		isLoading?: boolean;
		onBack: () => void;
		onSubmit: () => void | Promise<void>;
		zipFile?: File | null;
		glbFile?: File | null;
		projectFile?: File | null;
		cropFolderFiles?: File[];
	};

	let {
		isLoading = false,
		onBack,
		onSubmit,
		zipFile = $bindable(null),
		glbFile = $bindable(null),
		projectFile = $bindable(null),
		cropFolderFiles = $bindable([])
	}: Props = $props();
</script>

<div class="space-y-4">
	<button
		type="button"
		class="text-ui-label text-warm-gray-500 transition-colors hover:text-creator-blue"
		onclick={onBack}
	>
		<i class="fa-solid fa-arrow-left mr-1.5" aria-hidden="true"></i>{$_('ui.back_to_launcher')}
	</button>

	<div class="space-y-4">
		<div class="rounded-sm border border-creator-blue/25 bg-creator-blue/[0.04] p-3.5">
			<div class="mb-2 flex items-center gap-2">
				<i class="fa-solid fa-file-zipper text-xs text-creator-blue" aria-hidden="true"></i>
				<p class="text-ui-label text-creator-blue">{$_('ui.zip_bundle_recommendation')}</p>
			</div>
			<label
				class="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-black/10 bg-white px-3 py-2 transition-colors hover:border-creator-blue/50 focus-within:ring-2 focus-within:ring-creator-blue/25"
			>
				<span class="min-w-0 truncate text-body-text text-near-black">
					{zipFile ? zipFile.name : $_('editor.no_file_selected')}
				</span>
				<span class="btn-secondary shrink-0 px-2.5 py-1 text-xs">{$_('ui.select_file')}</span>
				<input
					type="file"
					accept=".zip"
					onchange={(e) => (zipFile = e.currentTarget.files?.[0] ?? null)}
					class="sr-only"
				/>
			</label>
		</div>

		<div class="flex items-center gap-3">
			<div class="h-px flex-1 bg-black/10"></div>
			<span class="text-micro-data text-warm-gray-400">{$_('ui.or')}</span>
			<div class="h-px flex-1 bg-black/10"></div>
		</div>

		<div class="grid grid-cols-1 gap-3">
			<div class="space-y-1">
				<label for="glb-model" class="label-studio">{$_('ui.glb_model')}</label>
				<div
					class="relative flex items-center justify-between gap-3 rounded-sm border border-black/10 bg-black/[0.04] px-3 py-2 transition-colors focus-within:border-creator-blue focus-within:bg-white focus-within:ring-2 focus-within:ring-creator-blue/25 hover:border-black/20"
				>
					<span
						class={`min-w-0 truncate text-body-text ${glbFile ? 'text-near-black' : 'text-warm-gray-400'}`}
					>
						{glbFile ? glbFile.name : $_('editor.no_file_selected')}
					</span>
					<span class="btn-secondary pointer-events-none shrink-0 px-2.5 py-1 text-xs">
						{$_('ui.select_file')}
					</span>
					<input
						id="glb-model"
						type="file"
						accept=".glb"
						onchange={(e) => (glbFile = e.currentTarget.files?.[0] ?? null)}
						class="absolute inset-0 cursor-pointer opacity-0"
					/>
				</div>
			</div>

			<div class="space-y-1">
				<label for="project-json" class="label-studio">{$_('ui.project_json')}</label>
				<div
					class="relative flex items-center justify-between gap-3 rounded-sm border border-black/10 bg-black/[0.04] px-3 py-2 transition-colors focus-within:border-creator-blue focus-within:bg-white focus-within:ring-2 focus-within:ring-creator-blue/25 hover:border-black/20"
				>
					<span
						class={`min-w-0 truncate text-body-text ${projectFile ? 'text-near-black' : 'text-warm-gray-400'}`}
					>
						{projectFile ? projectFile.name : $_('editor.no_file_selected')}
					</span>
					<span class="btn-secondary pointer-events-none shrink-0 px-2.5 py-1 text-xs">
						{$_('ui.select_file')}
					</span>
					<input
						id="project-json"
						type="file"
						accept=".json"
						onchange={(e) => (projectFile = e.currentTarget.files?.[0] ?? null)}
						class="absolute inset-0 cursor-pointer opacity-0"
					/>
				</div>
			</div>

			<div class="space-y-1">
				<label for="crops-directory" class="label-studio">{$_('ui.crops_directory')}</label>
				<div
					class="relative flex items-center justify-between gap-3 rounded-sm border border-black/10 bg-black/[0.04] px-3 py-2 transition-colors focus-within:border-creator-blue focus-within:bg-white focus-within:ring-2 focus-within:ring-creator-blue/25 hover:border-black/20"
				>
					<span
						class={`min-w-0 truncate text-body-text ${cropFolderFiles.length ? 'text-near-black' : 'text-warm-gray-400'}`}
					>
						{cropFolderFiles.length
							? $_('editor.files_selected', { values: { count: cropFolderFiles.length } })
							: $_('editor.no_file_selected')}
					</span>
					<span class="btn-secondary pointer-events-none shrink-0 px-2.5 py-1 text-xs">
						{$_('editor.choose_folder')}
					</span>
					<input
						id="crops-directory"
						type="file"
						multiple
						webkitdirectory
						onchange={(e) => (cropFolderFiles = Array.from(e.currentTarget.files ?? []))}
						class="absolute inset-0 cursor-pointer opacity-0"
					/>
				</div>
			</div>
		</div>
	</div>

	<button type="button" onclick={onSubmit} disabled={isLoading} class="btn-primary mt-2 w-full">
		{#if isLoading}
			<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>
			{$_('ui.initializing')}
		{:else}
			{$_('ui.launch_workspace')}
		{/if}
	</button>
</div>

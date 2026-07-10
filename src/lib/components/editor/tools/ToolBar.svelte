<script>
	import { _ } from 'svelte-i18n';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import { vibrateOnAction } from '$lib/assets/js/mobile-utils.js';
	import { viewport } from '$lib/state/viewport.svelte.js';

	let {
		title = '',
		activeTool = $bindable(null),
		tools = [],
		onBack = null,
		undo = null,
		redo = null,
		finish = null,
		cancel = null,
		save = null,
		controls,
		children
	} = $props();

	let isCompact = $derived(!viewport.isExpanded);

	function selectTool(tool) {
		if (tool.disabled) return;
		vibrateOnAction('selection');
		if (tool.onSelect) {
			tool.onSelect();
			return;
		}
		activeTool = tool.toggle === false || activeTool !== tool.id ? tool.id : null;
	}

	function run(action, vibration = 'light') {
		if (!action || action.disabled) return;
		vibrateOnAction(vibration);
		action.run?.();
	}
</script>

<div class="fixed top-2 left-2 right-2 z-50">
	<div class="panel flex items-center justify-between gap-2 bg-white p-1.5 shadow-panel">
		<div class="flex min-w-0 items-center gap-2.5">
			{#if onBack}
				<button
					type="button"
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-black/10 bg-black/5 text-near-black transition-none hover:bg-black/10 md:h-7 md:w-7"
					onclick={onBack}
					title={$_('ui.back_to_launcher')}
					aria-label={$_('ui.back_to_launcher')}
				>
					<i class="fa-solid fa-arrow-left text-[11px]"></i>
				</button>
			{/if}
			{#if title}
				<h1 class="truncate px-1 text-section-title leading-none sm:mr-2">{title}</h1>
			{/if}

			{#if !isCompact}
				<div class="h-5 w-px bg-black/15"></div>
				<div class="flex items-center gap-1">
					{#each tools.filter((tool) => !tool.hidden) as tool}
						<button
							type="button"
							class={`flex items-center gap-2 rounded-sm px-3 py-1.5 text-ui-label transition-none ${activeTool === tool.id ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
							onclick={() => selectTool(tool)}
							disabled={tool.disabled}
							title={tool.title || tool.label}
							aria-label={tool.label}
						>
							<i class={`fa-solid ${tool.icon}`}></i>
							<span class="hidden xl:inline">{tool.label}</span>
						</button>
					{/each}
				</div>
				{@render controls?.()}
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1.5 md:gap-3">
			{#if !isCompact}
				{#if undo || redo}
					<div class="flex items-center gap-1">
						{#each [undo, redo] as action, index}
							{#if action}
								<button
									type="button"
									class="flex h-7 w-7 items-center justify-center rounded-sm text-warm-gray-500 transition-none hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
									onclick={() => run(action)}
									disabled={action.disabled}
									title={action.label}
									aria-label={action.label}
								>
									<i
										class={`fa-solid ${index === 0 ? 'fa-rotate-left' : 'fa-rotate-right'} text-[11px]`}
									></i>
								</button>
							{/if}
						{/each}
					</div>
				{/if}
				{#if finish || cancel}
					<div class="flex items-center gap-1">
						{#if finish}<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-sm bg-creator-blue text-white transition-none hover:bg-creator-blue-active disabled:opacity-40"
								onclick={() => run(finish, 'success')}
								disabled={finish.disabled}
								title={finish.label || $_('ui.finish')}
								aria-label={finish.label || $_('ui.finish')}
								><i class="fa-solid fa-check text-[11px]"></i></button
							>{/if}
						{#if cancel}<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-sm border border-black/15 bg-warm-white text-warm-gray-500 transition-none hover:bg-black/5 disabled:opacity-40"
								onclick={() => run(cancel)}
								disabled={cancel.disabled}
								title={cancel.label || $_('ui.cancel')}
								aria-label={cancel.label || $_('ui.cancel')}
								><i class="fa-solid fa-xmark text-[11px]"></i></button
							>{/if}
					</div>
				{/if}
			{/if}
			{#if save}
				<SaveStatus status={save.status} errorMessage={save.errorMessage} />
				<button
					type="button"
					class="bg-creator-blue rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm transition-none hover:bg-creator-blue-active disabled:opacity-40 md:px-4"
					onclick={() => run(save)}
					disabled={save.disabled || save.status === 'saving'}
					>{save.label || $_('save.save_to_server')}</button
				>
			{/if}
		</div>
	</div>
</div>

{#if isCompact}
	<div class="fixed bottom-3 left-2 right-2 z-50 flex justify-center pointer-events-none">
		<div
			class="panel flex max-w-full items-center gap-1 overflow-x-auto bg-white p-1.5 shadow-panel pointer-events-auto"
		>
			{#each tools.filter((tool) => !tool.hidden) as tool}
				<button
					type="button"
					class={`flex h-11 min-w-11 items-center justify-center rounded-sm px-3 text-ui-label transition-none ${activeTool === tool.id ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
					onclick={() => selectTool(tool)}
					disabled={tool.disabled}
					title={tool.title || tool.label}
					aria-label={tool.label}
				>
					<i class={`fa-solid ${tool.icon}`}></i><span class="ml-1.5 hidden sm:inline"
						>{tool.label}</span
					>
				</button>
			{/each}
			{#if undo || redo}<div class="mx-0.5 h-7 w-px shrink-0 bg-black/15"></div>{/if}
			{#if undo}<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5 disabled:opacity-40"
					onclick={() => run(undo)}
					disabled={undo.disabled}
					title={undo.label}
					aria-label={undo.label}><i class="fa-solid fa-rotate-left"></i></button
				>{/if}
			{#if redo}<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5 disabled:opacity-40"
					onclick={() => run(redo)}
					disabled={redo.disabled}
					title={redo.label}
					aria-label={redo.label}><i class="fa-solid fa-rotate-right"></i></button
				>{/if}
			{#if finish || cancel}<div class="mx-0.5 h-7 w-px shrink-0 bg-black/15"></div>{/if}
			{#if finish}<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-creator-blue text-white disabled:opacity-40"
					onclick={() => run(finish, 'success')}
					disabled={finish.disabled}
					title={finish.label || $_('ui.finish')}
					aria-label={finish.label || $_('ui.finish')}><i class="fa-solid fa-check"></i></button
				>{/if}
			{#if cancel}<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-black/15 bg-warm-white text-warm-gray-500 disabled:opacity-40"
					onclick={() => run(cancel)}
					disabled={cancel.disabled}
					title={cancel.label || $_('ui.cancel')}
					aria-label={cancel.label || $_('ui.cancel')}><i class="fa-solid fa-xmark"></i></button
				>{/if}
		</div>
	</div>
{/if}

{@render children?.()}

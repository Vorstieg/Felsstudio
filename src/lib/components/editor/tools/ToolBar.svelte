<script>
	import { _ } from 'svelte-i18n';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import ToolButton from './ToolButton.svelte';
	import ToolActionButton from './ToolActionButton.svelte';
	import { createToolInteraction } from './tool-interaction.js';

	let {
		activeTool = $bindable('select'),
		toolOptionsOpen = $bindable(true),
		neutralTool = 'select',
		tools = [],
		undo = null,
		redo = null,
		finish = null,
		cancel = null,
		save = null,
		mobileSearch,
		controls,
		children
	} = $props();

	let isCompact = $derived(!viewport.isExpanded);
	function observeMobileDock(node) {
		const updateDockHeight = () => {
			document.documentElement.style.setProperty('--mobile-tool-dock-height', `${node.offsetHeight}px`);
		};
		const observer = new ResizeObserver(updateDockHeight);
		observer.observe(node);
		updateDockHeight();
		return () => {
			observer.disconnect();
			document.documentElement.style.removeProperty('--mobile-tool-dock-height');
		};
	}

	const { selectTool, runAction } = createToolInteraction({
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setOptionsOpen: (value) => (toolOptionsOpen = value),
		neutralTool
	});
</script>

<div class="fixed top-2 left-2 right-2 z-50">
	<div class="panel flex items-center justify-between gap-2 bg-white p-1.5 shadow-panel">
		<div class="flex min-w-0 items-center gap-2.5">

			{#if !isCompact}
				<div class="flex items-center gap-1">
					{#each tools.filter((tool) => !tool.hidden) as tool}
						<ToolButton {tool} active={activeTool === tool.id} onclick={() => selectTool(tool)} />
					{/each}
				</div>
				{@render controls?.()}
			{/if}
		</div>

		{#if mobileSearch && isCompact}
			<div class="min-w-0 flex-1">{@render mobileSearch()}</div>
		{/if}

		<div class="flex shrink-0 items-center gap-1.5 md:gap-3">
			{#if !isCompact}
				{#if undo || redo}
					<div class="flex items-center gap-1">
						{#each [undo, redo] as action, index}
							{#if action}
								<ToolActionButton action={action} icon={index === 0 ? 'fa-rotate-left' : 'fa-rotate-right'} onclick={() => runAction(action, { finish, cancel })} />
							{/if}
						{/each}
					</div>
				{/if}
				{#if finish || cancel}
					<div class="flex items-center gap-1">
						{#if finish}<ToolActionButton action={finish} icon="fa-check" variant="finish" onclick={() => runAction(finish, { finish, cancel, vibration: 'success' })} />{/if}
						{#if cancel}<ToolActionButton action={cancel} icon="fa-xmark" variant="cancel" onclick={() => runAction(cancel, { finish, cancel })} />{/if}
					</div>
				{/if}
			{/if}
			{#if save}
				<SaveStatus status={save.status} errorMessage={save.errorMessage} />
				<button
					type="button"
					class="bg-creator-blue rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm transition-none hover:bg-creator-blue-active disabled:opacity-40 md:px-4"
					onclick={() => runAction(save, { finish, cancel })}
					disabled={save.disabled || save.status === 'saving'}
					>{save.label || $_('save.save_to_server')}</button
				>
			{/if}
		</div>
	</div>
</div>

{#if isCompact}
	<div class="fixed inset-x-0 z-50 flex justify-center pointer-events-none" style={`bottom: calc(${toolOptionsOpen ? '0px' : 'var(--info-panel-height, 0px)'} + max(0.75rem, env(safe-area-inset-bottom))); transition: var(--info-panel-transition, none); visibility: ${toolOptionsOpen ? 'visible' : 'var(--mobile-toolbar-visibility, visible)'};`}>
		<div use:observeMobileDock class="flex w-full flex-col gap-0 pointer-events-auto">
			<div class="panel flex w-full items-center justify-center gap-1 overflow-x-auto rounded-none border-x-0 p-1.5 shadow-panel">
			{#each tools.filter((tool) => !tool.hidden) as tool}
				<ToolButton {tool} active={activeTool === tool.id} compact onclick={() => selectTool(tool)} />
			{/each}
				{#if undo || redo}<div class="mx-0.5 h-7 w-px shrink-0 bg-black/15"></div>{/if}
			{#if undo}<ToolActionButton action={undo} icon="fa-rotate-left" compact onclick={() => runAction(undo, { finish, cancel })} />{/if}
			{#if redo}<ToolActionButton action={redo} icon="fa-rotate-right" compact onclick={() => runAction(redo, { finish, cancel })} />{/if}
			{#if finish || cancel}<div class="mx-0.5 h-7 w-px shrink-0 bg-black/15"></div>{/if}
			{#if finish}<ToolActionButton action={finish} icon="fa-check" variant="finish" compact onclick={() => runAction(finish, { finish, cancel, vibration: 'success' })} />{/if}
			{#if cancel}<ToolActionButton action={cancel} icon="fa-xmark" variant="cancel" compact onclick={() => runAction(cancel, { finish, cancel })} />{/if}
			</div>
		</div>
	</div>
{/if}

{@render children?.()}

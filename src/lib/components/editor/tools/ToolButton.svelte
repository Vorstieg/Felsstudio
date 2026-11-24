<script lang="ts">
	import type { ToolInteractionTool } from './tool-interaction.ts';

	type ToolButtonDefinition = ToolInteractionTool & {
		label: string;
		icon: string;
		title?: string;
	};

	let {
		tool,
		active = false,
		compact = false,
		dense = false,
		onclick
	}: {
		tool: ToolButtonDefinition;
		active?: boolean;
		compact?: boolean;
		dense?: boolean;
		onclick: () => void;
	} = $props();
</script>

<button
	type="button"
	class={compact
		? `flex shrink-0 items-center justify-center rounded-sm text-ui-label transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${dense ? 'h-9 min-w-9 px-2' : 'h-11 min-w-11 px-3'} ${active ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`
		: `flex h-8 shrink-0 items-center justify-center rounded-sm text-ui-label whitespace-nowrap transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${dense ? (active ? 'gap-1.5 px-2.5' : 'w-8 px-0 2xl:w-auto 2xl:gap-1.5 2xl:px-2') : active ? 'gap-2 px-3' : 'w-8 px-0 xl:w-auto xl:gap-2 xl:px-3'} ${active ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
	onclick={onclick}
	disabled={tool.disabled}
	title={tool.title || tool.label}
	aria-label={tool.label}
	aria-pressed={active}
>
	<i class={`fa-solid ${tool.icon}`} aria-hidden="true"></i>
	<span
		class={compact
			? 'hidden'
			: active
				? 'inline'
				: dense
					? 'hidden 2xl:inline'
					: 'hidden xl:inline'}>{tool.label}</span
	>
</button>

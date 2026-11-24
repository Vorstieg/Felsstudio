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
		? `flex items-center justify-center rounded-sm text-ui-label transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${dense ? 'h-9 min-w-9 px-2' : 'h-11 min-w-11 px-3'} ${active ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`
		: `flex items-center rounded-sm text-ui-label transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${dense ? 'gap-1.5 px-2 py-1' : 'gap-2 px-3 py-1.5'} ${active ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
	onclick={onclick}
	disabled={tool.disabled}
	title={tool.title || tool.label}
	aria-label={tool.label}
	aria-pressed={active}
>
	<i class={`fa-solid ${tool.icon}`} aria-hidden="true"></i>
	<span class={compact ? 'hidden' : 'inline'}>{tool.label}</span>
</button>

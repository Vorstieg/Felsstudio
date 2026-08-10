<script>
	let { tool, active = false, compact = false, dense = false, onclick } = $props();
</script>

<button
	type="button"
	class={compact
		? `flex items-center justify-center rounded-sm text-ui-label transition-none ${dense ? 'h-9 min-w-9 px-2' : 'h-11 min-w-11 px-3'} ${active ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`
		: `flex items-center rounded-sm text-ui-label transition-none ${dense ? 'gap-1.5 px-2 py-1' : 'gap-2 px-3 py-1.5'} ${active ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
	onclick={onclick}
	disabled={tool.disabled}
	title={tool.title || tool.label}
	aria-label={tool.label}
	aria-pressed={active}
>
	<i class={`fa-solid ${tool.icon}`}></i>
	<span class={compact ? 'hidden' : 'inline'}>{tool.label}</span>
</button>

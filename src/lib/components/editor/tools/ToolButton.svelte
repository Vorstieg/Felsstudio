<script>
	let { tool, active = false, compact = false, onclick } = $props();
</script>

<button
	type="button"
	class={compact
		? `flex h-11 min-w-11 items-center justify-center rounded-sm px-3 text-ui-label transition-none ${active ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`
		: `flex items-center gap-2 rounded-sm px-3 py-1.5 text-ui-label transition-none ${active ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'} ${tool.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
	onclick={onclick}
	disabled={tool.disabled}
	title={tool.title || tool.label}
	aria-label={tool.label}
	aria-pressed={active}
>
	<i class={`fa-solid ${tool.icon}`}></i>
	<span class={compact ? 'ml-1.5 hidden sm:inline' : 'hidden xl:inline'}>{tool.label}</span>
</button>

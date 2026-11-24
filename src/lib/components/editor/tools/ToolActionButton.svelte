<script lang="ts">
	import type { ToolInteractionAction } from './tool-interaction.ts';
	type ActionButtonVariant = 'default' | 'finish' | 'cancel';

	let {
		action,
		icon,
		compact = false,
		variant = 'default',
		onclick
	}: {
		action: ToolInteractionAction & { label: string };
		icon: string;
		compact?: boolean;
		variant?: ActionButtonVariant;
		onclick: () => void;
	} = $props();

	let classes = $derived(
		compact
			? `flex h-11 w-11 shrink-0 items-center justify-center rounded-sm transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${variant === 'finish' ? 'bg-creator-blue text-white' : variant === 'cancel' ? 'border border-black/15 bg-warm-white text-warm-gray-600' : 'text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} disabled:opacity-40`
			: `flex ${variant === 'finish' || variant === 'cancel' ? 'h-8 w-8' : 'h-7 w-7'} items-center justify-center rounded-sm transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${variant === 'finish' ? 'bg-creator-blue text-white hover:bg-creator-blue-active' : variant === 'cancel' ? 'border border-black/15 bg-warm-white text-warm-gray-600 hover:bg-black/5' : 'text-warm-gray-500 hover:bg-black/5 hover:text-near-black'} disabled:cursor-not-allowed disabled:opacity-40`
	);
</script>

<button
	type="button"
	class={classes}
	onclick={onclick}
	disabled={action.disabled}
	title={action.label}
	aria-label={action.label}
>
	<i class={`fa-solid ${icon}`} aria-hidden="true"></i>
</button>

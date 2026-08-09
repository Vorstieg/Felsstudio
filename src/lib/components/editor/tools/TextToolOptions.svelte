<script>
	import { _ } from 'svelte-i18n';
	import ToolOptions from './ToolOptions.svelte';

	let { textTool, open = true, onClose } = $props();
</script>

<ToolOptions title={$_('ui.text_options')} {open} {onClose}>
	<div class="flex flex-col gap-2">
		<label class="text-ui-label" for="text-font-size">{$_('ui.font_size')}</label>
		<input
			id="text-font-size"
			class="input-studio w-full"
			type="number"
			min="12"
			max="72"
			step="1"
			value={textTool?.fontSize2D ?? 24}
			onchange={(event) => textTool?.format({ fontSize2D: event.currentTarget.value })}
		/>

		<label class="text-ui-label" for="text-color">{$_('ui.text_color')}</label>
		<input
			id="text-color"
			class="input-studio h-8 w-full p-1"
			type="color"
			value={textTool?.color ?? '#111827'}
			onchange={(event) => textTool?.format({ color: event.currentTarget.value })}
		/>

		<label class="text-ui-label" for="text-weight">{$_('ui.font_weight')}</label>
		<select
			id="text-weight"
			class="input-studio w-full"
			value={textTool?.fontWeight ?? 600}
			onchange={(event) => textTool?.format({ fontWeight: event.currentTarget.value })}
		>
			<option value="400">{$_('ui.regular')}</option>
			<option value="600">{$_('ui.semibold')}</option>
			<option value="700">{$_('ui.bold')}</option>
		</select>

		<label class="text-ui-label" for="text-alignment">{$_('ui.text_alignment')}</label>
		<div id="text-alignment" class="grid grid-cols-3 gap-1">
			{#each ['left', 'center', 'right'] as alignment}
				<button
					type="button"
					class="button-studio"
					class:bg-creator-blue={textTool?.textAlign2D === alignment}
					class:text-white={textTool?.textAlign2D === alignment}
					onclick={() => textTool?.format({ textAlign2D: alignment })}
					aria-label={$_(`ui.align_${alignment}`)}
				>
					<i class={`fa-solid fa-align-${alignment}`}></i>
				</button>
			{/each}
		</div>
		<p class="text-[10px] text-warm-gray-500">{$_('ui.text_tool_hint')}</p>
	</div>
</ToolOptions>

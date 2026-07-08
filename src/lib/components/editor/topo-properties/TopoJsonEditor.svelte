<script>
	let { id = 'topo-json-editor', text = $bindable(''), error = '', onformat, onapply } = $props();
</script>

<div class="rounded-sm border border-black/15 bg-near-black p-2 shadow-sm">
	<div class="mb-1.5 flex items-center justify-between gap-2">
		<label for={id} class="text-ui-label block text-white/80">Topo JSON</label>
		<div class="flex items-center gap-1">
			<button
				class="rounded-sm border border-white/15 bg-white/10 px-2 py-1 text-micro-data font-bold text-white/80 hover:bg-white/20"
				onclick={onformat}
			>
				Format
			</button>
			<button
				class="rounded-sm bg-white px-2 py-1 text-micro-data font-bold text-near-black hover:bg-warm-white"
				onclick={onapply}
			>
				Apply
			</button>
		</div>
	</div>
	<textarea
		{id}
		bind:value={text}
		spellcheck="false"
		rows="14"
		class="w-full resize-y rounded-sm border border-white/15 bg-black p-2 font-mono text-[11px] leading-relaxed text-white outline-none focus:border-white/40"
	></textarea>
	{#if error}
		<p class="mt-1.5 text-micro-data font-bold text-rose-300">{error}</p>
	{/if}
</div>

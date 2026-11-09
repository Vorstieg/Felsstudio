<script lang="ts">
	import { getDraftEditor } from './use-draft-editor.svelte';
	let {
		src,
		alt,
		class: className = '',
		eager = false
	}: {
		src: string | null;
		alt: string;
		class?: string;
		eager?: boolean;
	} = $props();
	const draft = getDraftEditor();
	let element = $state<HTMLImageElement>();
	let visible = $state(false);
	let resolved = $state<string | null>(null);
	let failed = $state(false);
	let retry = $state(0);
	$effect(() => {
		src; // Recheck visibility when a cluster reuses thumbnail elements.
		visible = false;
		if (!element || eager || typeof IntersectionObserver === 'undefined') {
			visible = true;
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				visible = true;
				observer.disconnect();
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	});
	$effect(() => {
		const source = src;
		retry;
		resolved = null;
		failed = false;
		if (!source || (!eager && !visible)) return;
		if (!source.startsWith('processing-crop:')) {
			resolved = source;
			return;
		}
		if (!draft?.ready) return;
		let disposed = false;
		let url: string | undefined;
		void draft
			?.loadProcessingCrop(source)
			.then((blob) => {
				if (disposed) return;
				url = URL.createObjectURL(blob);
				resolved = url;
			})
			.catch(() => {
				if (!disposed) failed = true;
			});
		return () => {
			disposed = true;
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<img bind:this={element} src={resolved} {alt} class={className} decoding="async" />
{#if eager && failed}
	<button class="pointer-events-auto text-xs underline" onclick={() => retry++}>Retry image</button>
{/if}

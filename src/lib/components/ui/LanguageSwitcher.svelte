<script lang="ts">
	import { browser } from '$app/environment';
	import { locale, _ } from 'svelte-i18n';

	const STORAGE_KEY = 'felsstudio_locale';

	let { compact = false }: { compact?: boolean } = $props();

	let activeLocale = $derived(($locale || 'de').toLowerCase().startsWith('en') ? 'en' : 'de');

	function setLanguage(lang: 'de' | 'en') {
		locale.set(lang);
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, lang);
			} catch {
				// Ignore storage access failures in restricted contexts.
			}
		}
	}
</script>

<div
	class="inline-flex items-center rounded-sm border border-black/15 bg-black/5 p-0.5"
	role="group"
	aria-label={$_('editor.language')}
>
	{#each ['de', 'en'] as const as lang}
		<button
			type="button"
			class={`rounded-sm font-bold uppercase transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue ${
				compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[10px]'
			} ${
				activeLocale === lang
					? 'bg-white text-near-black shadow-sm'
					: 'text-warm-gray-500 hover:text-near-black'
			}`}
			aria-pressed={activeLocale === lang}
			onclick={() => setLanguage(lang)}
		>
			{lang}
		</button>
	{/each}
</div>

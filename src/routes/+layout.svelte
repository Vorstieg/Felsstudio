<script>
	import '../app.css';
	import { base } from '$app/paths';
	import '@fortawesome/fontawesome-free/css/fontawesome.css';
	import '@fortawesome/fontawesome-free/css/brands.css';
	import '@fortawesome/fontawesome-free/css/solid.css';

	import { init, addMessages, _, getLocaleFromNavigator } from 'svelte-i18n';
	import en from '$lib/i18n/locales/en.json';
	import de from '$lib/i18n/locales/de.json';
	import AuthPrompt from '$lib/components/ui/AuthPrompt.svelte';
	import { initViewport } from '$lib/state/viewport.svelte.js';
	import { onMount } from 'svelte';

	addMessages('en', en);
	addMessages('de', de);

	init({
		fallbackLocale: 'de',
		initialLocale: getLocaleFromNavigator()
	});

	onMount(() => {
		return initViewport();
	});

	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();

	let displayTitle = $derived($_('menu.creator') + ' | ' + $_('site.title'));
</script>

<svelte:head>
	<title>{displayTitle}</title>
	<link rel="stylesheet" href="{base}/css/vars.css" />
	<link rel="stylesheet" href="{base}/css/root.css" />
	<link rel="stylesheet" href="{base}/css/typography.css" />
	<link rel="stylesheet" href="{base}/css/layout.css" />
	<link rel="stylesheet" href="{base}/css/utilities.css" />
	<link rel="stylesheet" href="{base}/css/prism.css" />
	<link rel="icon" href="{base}/favicon.png" />
</svelte:head>

<div class="creator-studio">
	<main id="main" class="w-full h-full overflow-hidden" tabindex="-1">
		{@render children?.()}
	</main>
	<AuthPrompt />
</div>

<style>
    .creator-studio {
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background-color: var(--color-warm-white);
    }
</style>
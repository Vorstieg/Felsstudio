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
	import { navigating } from '$app/state';
	import { browser } from '$app/environment';
	addMessages('en', en);
	addMessages('de', de);

	init({
		fallbackLocale: 'de',
		initialLocale: getLocaleFromNavigator()
	});

	onMount(() => {
		const cleanupViewport = initViewport();

		if (browser && import.meta.env.DEV && !window.__FELSSTUDIO_ERUDA_INITIALIZED__) {
			window.__FELSSTUDIO_ERUDA_INITIALIZED__ = true;
			void import('eruda').then(({ default: eruda }) => eruda.init()).catch((error) => {
				window.__FELSSTUDIO_ERUDA_INITIALIZED__ = false;
				console.warn('Failed to initialize Eruda:', error);
			});
		}

		return cleanupViewport;
	});

	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();

	let displayTitle = $derived($_('menu.creator') + ' | ' + $_('site.title'));
	let showNavigationSpinner = $derived.by(() => {
		const path = navigating.to?.url.pathname;
		return (
			path === '/crags/select' ||
			path === '/topos/2d/select' ||
			path === '/topos/3d/select' ||
			path?.startsWith('/crags/editor/') ||
			path === '/topos/2d/editor' ||
			path === '/topos/3d/editor' ||
			path === '/topos/3d/upload'
		);
	});
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
	{#if showNavigationSpinner}
		<div class="fixed right-4 top-4 z-50 panel bg-white px-4 py-3 flex items-center gap-3 shadow-lg">
			<i class="fa-solid fa-spinner fa-spin text-creator-blue text-lg"></i>
			<span class="text-micro-data font-bold text-near-black uppercase tracking-widest">Loading</span>
		</div>
	{/if}
</div>

<style>
    .creator-studio {
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background-color: var(--color-warm-white);
    }
</style>
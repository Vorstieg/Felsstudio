<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { _ } from 'svelte-i18n';
	import maplibregl from 'maplibre-gl';
	import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { loadMapStyle } from '$lib/map-style.ts';
	import type { Point2D } from '@vorstieg/fels-types/types';

	type MapStyle = 'transport' | 'satellite' | 'terrain';
	type Props = {
		map?: MapLibreMap | null;
		isMapLoaded?: boolean;
		mapStyle?: MapStyle;
		initialCoordinates?: Point2D;
		onStyleLoad?: (_map: MapLibreMap) => void;
		onMapClick?: (_event: MapMouseEvent) => void;
		onGpxFileDrop?: (_file: File) => void;
	};

	let {
		map = $bindable<MapLibreMap | null>(null),
		isMapLoaded = $bindable(false),
		mapStyle = 'terrain',
		initialCoordinates = [0, 0] as Point2D,
		onStyleLoad = () => {},
		onMapClick = () => {},
		onGpxFileDrop
	}: Props = $props();

	let mapElement = $state<HTMLDivElement | undefined>();
	let currentLoadedStyle = $state<MapStyle | undefined>();
	let isDraggingGpx = $state(false);
	let dragDepth = 0;

	function hasDraggedFile(event: DragEvent): boolean {
		return Boolean(event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes('Files'));
	}

	function handleDragEnter(event: DragEvent) {
		if (!onGpxFileDrop || !hasDraggedFile(event)) return;
		event.preventDefault();
		dragDepth += 1;
		isDraggingGpx = true;
	}

	function handleDragOver(event: DragEvent) {
		if (!onGpxFileDrop || !hasDraggedFile(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function handleDragLeave(event: DragEvent) {
		if (!onGpxFileDrop || !hasDraggedFile(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) isDraggingGpx = false;
	}

	function handleDrop(event: DragEvent) {
		if (!onGpxFileDrop || !hasDraggedFile(event)) return;
		event.preventDefault();
		dragDepth = 0;
		isDraggingGpx = false;
		const files = Array.from(event.dataTransfer?.files || []);
		const gpxFile = files.find(
			(file) => /\.gpx$/i.test(file.name) || file.type === 'application/gpx+xml'
		);
		if (gpxFile) onGpxFileDrop(gpxFile);
	}

	function handleDragEnd() {
		dragDepth = 0;
		isDraggingGpx = false;
	}

	onMount(() => {
		let disposed = false;
		void initialiseMap();

		return () => {
			disposed = true;
			if (map) map.remove();
			map = null;
			isMapLoaded = false;
		};

		async function initialiseMap() {
			const coords = initialCoordinates || [0, 0];
			const style = await loadMapStyle(mapStyle).catch(
				() => 'https://demotiles.maplibre.org/style.json'
			);
			if (disposed || !mapElement) return;
			const currentMap = new maplibregl.Map({
				container: mapElement,
				style,
				center: [coords[0], coords[1]],
				zoom: 13,
				bearing: 0,
				pitch: 0,
				maxPitch: 85,
				dragRotate: true,
				touchPitch: true,
				pitchWithRotate: true,
				attributionControl: false
			});
			map = currentMap;
			currentMap.on('style.load', () => {
				currentLoadedStyle = mapStyle;
				isMapLoaded = true;
				onStyleLoad(currentMap);
			});

			currentMap.on('click', onMapClick);
		}
	});

	$effect(() => {
		const style = mapStyle;
		if (map && isMapLoaded && style !== currentLoadedStyle) {
			untrack(() => {
				isMapLoaded = false;
				void loadMapStyle(style)
					.then((nextStyle) => map?.setStyle(nextStyle, { diff: true }))
					.catch(() => map?.setStyle('https://demotiles.maplibre.org/style.json', { diff: true }));
				currentLoadedStyle = style;
			});
		}
	});
</script>

<div
	class="h-screen w-screen absolute overflow-hidden bg-warm-white"
	role="region"
	aria-label={$_('editor.map_canvas')}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	ondragend={handleDragEnd}
>
	<div bind:this={mapElement} class="w-full h-full"></div>
	{#if isDraggingGpx}
		<div
			class="pointer-events-none fixed inset-4 z-[150] flex items-center justify-center rounded-sm border-2 border-dashed border-creator-blue bg-white/85 backdrop-blur-[1px]"
		>
			<div
				class="flex flex-col items-center gap-2 rounded-sm border border-creator-blue/25 bg-white px-6 py-4 text-center shadow-panel"
			>
				<span
					class="flex h-10 w-10 items-center justify-center rounded-sm bg-creator-blue/10 text-creator-blue"
				>
					<i class="fa-solid fa-file-import text-lg" aria-hidden="true"></i>
				</span>
				<p class="text-sm font-bold text-near-black">{$_('track.dropGpxTitle')}</p>
				<p class="text-micro-data text-warm-gray-500">{$_('track.dropGpxHint')}</p>
			</div>
		</div>
	{/if}
</div>

<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as THREE from 'three';
	import { base } from '$app/paths';

	let { 
		coordinates = $bindable([0, 0]), 
		wallAzimuth = $bindable(0), 
		altitude = $bindable(0),
		scale = $bindable(1),
		gltfScene,
		modelOffset,
		onClose 
	} = $props();

	let mapContainer;
	let map;
	let customLayer;
	let isPinned = $state(false);
	let relativeAltitude = $state(0);
	let isAltitudeInitialized = false;
	
	let initialCenter = (coordinates[0] === 0 && coordinates[1] === 0) ? [16.37, 48.20] : coordinates;
	
	if (coordinates[0] === 0 && coordinates[1] === 0) {
		coordinates = initialCenter;
	}

	onMount(async () => {
		let style;
		try {
			const response = await fetch(base + '/satellite.json');
			style = await response.json();
			if (style.sources?.places?.data) style.sources.places.data = { type: 'FeatureCollection', features: [] };
			if (style.sources?.routes?.data) style.sources.routes.data = { type: 'FeatureCollection', features: [] };
		} catch (e) {
			style = 'https://demotiles.maplibre.org/style.json';
		}

		map = new maplibregl.Map({
			container: mapContainer,
			style: style,
			center: initialCenter,
			zoom: 18,
			pitch: 45,
			bearing: 0,
			antialias: true
		});

		map.on('move', () => {
			if (!isPinned) {
				const center = map.getCenter();
				coordinates = [center.lng, center.lat];
			}
		});

		// --- Custom Layer Setup ---
		customLayer = {
			id: '3d-model',
			type: 'custom',
			renderingMode: '3d',
			onAdd: function (map, gl) {
				console.log('Custom Layer onAdd triggered');
				this.camera = new THREE.Camera();
				this.scene = new THREE.Scene();

				// Lights
				const directionalLight = new THREE.DirectionalLight(0xffffff);
				directionalLight.position.set(0, -70, 100).normalize();
				this.scene.add(directionalLight);

				const directionalLight2 = new THREE.DirectionalLight(0xffffff);
				directionalLight2.position.set(0, 70, 100).normalize();
				this.scene.add(directionalLight2);
				
				const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
				this.scene.add(ambientLight);

				this.modelGroup = new THREE.Group();
				this.scene.add(this.modelGroup);

				if (gltfScene) {
					console.log('Adding GLTF Scene to Map');
					const model = gltfScene.clone();
					const offset = modelOffset || [0, 0, 0];
					// Center model
					model.position.set(-offset[0], -offset[1], -offset[2]);
					this.modelGroup.add(model);
				} else {
					console.warn('No GLTF Scene provided to MapModal');
				}

				this.map = map;
				this.renderer = new THREE.WebGLRenderer({
					canvas: map.getCanvas(),
					context: gl,
					antialias: true
				});
				
				this.renderer.autoClear = false;
			},
			render: function (gl, args) {
				const elevation = map.queryTerrainElevation(coordinates) || 0;
				
				// Initialize relative altitude from existing absolute altitude if loaded
				if (!isAltitudeInitialized && altitude !== 0) {
					relativeAltitude = altitude - elevation;
					isAltitudeInitialized = true;
				}

				// Calculate absolute altitude based on current elevation + relative adjustment
				const modelAltitude = elevation + relativeAltitude;
				
				// Update bound prop with absolute value
				altitude = modelAltitude;
				
				// Rotation:
				// X: 90 deg to flip Y-up (GLTF) to Z-up (MapLibre)
				// Y: -wallAzimuth (Compass degrees to radians, counter-clockwise around Up-axis)
				const modelRotate = [Math.PI / 2, -wallAzimuth * Math.PI / 180, 0];

				const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
					coordinates,
					modelAltitude
				);

				// Scale to maintain meter size, multiplied by visual scale
				const finalScale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * scale;

				const rotationX = new THREE.Matrix4().makeRotationAxis(
					new THREE.Vector3(1, 0, 0),
					modelRotate[0]
				);
				const rotationY = new THREE.Matrix4().makeRotationAxis(
					new THREE.Vector3(0, 1, 0),
					modelRotate[1]
				);
				const rotationZ = new THREE.Matrix4().makeRotationAxis(
					new THREE.Vector3(0, 0, 1),
					modelRotate[2]
				);

				const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
				const l = new THREE.Matrix4()
					.makeTranslation(
						modelAsMercatorCoordinate.x,
						modelAsMercatorCoordinate.y,
						modelAsMercatorCoordinate.z
					)
					.scale(
						new THREE.Vector3(
							finalScale,
							-finalScale,
							finalScale
						)
					)
					.multiply(rotationX)
					.multiply(rotationY)
					.multiply(rotationZ);

				this.camera.projectionMatrix = m.multiply(l);
				this.renderer.resetState();
				this.renderer.render(this.scene, this.camera);
				this.map.triggerRepaint();
			}
		};

		map.on('style.load', () => {
			if (!map.getLayer('3d-model')) {
				map.addLayer(customLayer);
			}
		});
		
		// Fallback if style is already loaded
		if (map.isStyleLoaded() && !map.getLayer('3d-model')) {
			map.addLayer(customLayer);
		}
	});
	
	$effect(() => {
		// Trigger repaint when reactive properties change
		if (map && (wallAzimuth !== undefined || scale !== undefined || relativeAltitude !== undefined)) {
			map.triggerRepaint();
		}
	});

	onDestroy(() => {
		map?.remove();
	});

</script>

<div class="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
	<div class="bg-white w-full max-w-5xl h-[85vh] rounded shadow-modal border border-black/15 flex flex-col overflow-hidden">
		<!-- Header -->
		<div class="p-3 border-b border-black/15 flex justify-between items-center bg-white flex-shrink-0">
			<div>
                <h2 class="text-section-title leading-none mb-0.5">Geospatial Placement</h2>
                <p class="text-ui-label !m-0">Coordinate & Orientation Studio</p>
            </div>
			<button onclick={onClose} class="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-black/5 transition-none border border-transparent hover:border-black/10">
				<i class="fa-solid fa-xmark text-near-black text-sm"></i>
			</button>
		</div>

		<!-- Map Area -->
		<div class="flex-1 relative overflow-hidden bg-warm-white">
			<!-- Map -->
			<div bind:this={mapContainer} class="w-full h-full absolute inset-0 z-0 grayscale-[0.2]"></div>
			
			<!-- Crosshair -->
			{#if !isPinned}
				<div class="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
					<div class="w-10 h-10 border border-white/50 rounded-sm z-20 shadow-sm relative">
                        <div class="absolute top-1/2 left-0 w-full h-px bg-white/30"></div>
                        <div class="absolute left-1/2 top-0 h-full w-px bg-white/30"></div>
                    </div>
					<div class="absolute w-1.5 h-1.5 bg-red-500 rounded-sm z-30 shadow-sm"></div>
				</div>
			{/if}
			
			<!-- Controls Overlay -->
			<div class="absolute top-2 right-2 bottom-2 w-64 bg-white/90 backdrop-blur-md p-3 rounded shadow-panel border border-black/15 z-30 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
				<button 
					class={`btn-primary w-full shadow-sm ${isPinned ? '!bg-rose-600 hover:!bg-rose-700' : '!bg-emerald-600 hover:!bg-emerald-700'}`}
					onclick={() => isPinned = !isPinned}
				>
					<i class="fa-solid {isPinned ? 'fa-lock' : 'fa-lock-open'} mr-2 opacity-60"></i>
                    {isPinned ? 'Unlock Position' : 'Pin Position'}
				</button>

				<div class="space-y-3">
                    <div>
                        <label class="text-ui-label block mb-2">Wall Orientation</label>
                        <div class="flex items-center justify-center mb-3">
                            <div class="relative w-28 h-28 rounded-sm border border-black/10 flex items-center justify-center bg-black/5">
                                <div class="absolute text-[9px] font-black text-warm-gray-400 top-1">N</div>
                                <div class="absolute text-[9px] font-black text-warm-gray-400 bottom-1">S</div>
                                <div class="absolute text-[9px] font-black text-warm-gray-400 left-2">W</div>
                                <div class="absolute text-[9px] font-black text-warm-gray-400 right-2">O</div>
                                <div class="w-0.5 h-12 bg-rose-500 absolute bottom-1/2 origin-bottom transition-none" style="transform: rotate({wallAzimuth}deg)"></div>
                                <div class="w-2 h-2 bg-near-black rounded-sm z-10 shadow-sm"></div>
                            </div>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex justify-between items-center px-1">
                                <span class="text-micro-data font-bold text-near-black">{wallAzimuth}°</span>
                                <span class="text-[9px] text-warm-gray-400 uppercase font-bold tracking-widest">Azimuth</span>
                            </div>
                            <input type="range" min="0" max="360" bind:value={wallAzimuth} class="studio-range w-full">
                        </div>
                    </div>

                    <div class="pt-3 border-t border-black/10 space-y-2.5">
                        <div class="space-y-1.5">
                            <div class="flex justify-between items-center px-1">
                                <label class="text-ui-label !m-0">Height (Relative)</label>
                                <span class="text-micro-data font-mono text-near-black">{relativeAltitude > 0 ? '+' : ''}{relativeAltitude.toFixed(1)}m</span>
                            </div>
                            <input type="range" min="-50" max="50" step="0.5" bind:value={relativeAltitude} class="studio-range w-full !accent-emerald-600">
                            <div class="text-[9px] text-warm-gray-400 font-bold uppercase text-right px-1">Abs: {altitude.toFixed(1)}m</div>
                        </div>

                        <div class="space-y-1.5 pt-1">
                            <div class="flex justify-between items-center px-1">
                                <label class="text-ui-label !m-0">Model Scale</label>
                                <span class="text-micro-data font-mono text-near-black">x{scale.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0.01" max="10" step="0.01" bind:value={scale} class="studio-range w-full !accent-creator-blue">
                        </div>
                    </div>
                </div>

                <div class="mt-auto pt-3 border-t border-black/10">
                    <div class="bg-black/5 p-2 rounded-sm space-y-1">
                        <div class="flex justify-between text-micro-data font-mono"><span class="text-warm-gray-400">LAT</span> <span class="text-near-black font-bold">{coordinates[1].toFixed(6)}</span></div>
                        <div class="flex justify-between text-micro-data font-mono"><span class="text-warm-gray-400">LON</span> <span class="text-near-black font-bold">{coordinates[0].toFixed(6)}</span></div>
                    </div>
                </div>
			</div>
		</div>

		<!-- Footer -->
		<div class="p-2 border-t border-black/15 bg-white flex justify-end flex-shrink-0">
			<button onclick={onClose} class="btn-primary !px-6 shadow-sm">
				Save & Close
			</button>
		</div>
	</div>
</div>

<style>
	.studio-range {
		-webkit-appearance: none;
		background: transparent;
        height: 18px;
	}
	.studio-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		height: 10px;
		width: 10px;
		border-radius: 2px;
		background: #ffffff;
		cursor: pointer;
		margin-top: -3px;
		border: 2px solid currentColor;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	.studio-range::-webkit-slider-runnable-track {
		width: 100%;
		height: 4px;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 0px;
	}
</style>

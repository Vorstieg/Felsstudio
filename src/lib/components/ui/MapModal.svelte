<script>
	import { onDestroy, onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import * as THREE from 'three';
	import { base } from '$app/paths';

	let { 
		coordinates = $bindable([0, 0]), 
		altitude = $bindable(0),
		gltfScene,
		modelRotation = $bindable(),
		modelScale = $bindable(),
		onClose 
	} = $props();

	let mapContainer;
	let map;
	let customLayer;
	
	let uniformScale = $state(modelScale?.[0] || 1);
	function updateScale() {
		modelScale = [uniformScale, uniformScale, uniformScale];
		if (map) map.triggerRepaint();
	}
	
	// CSS 3D Gizmo State
	let gizmoX = $state(-1000);
	let gizmoY = $state(-1000);
	let mapPitch = $state(0);
	let mapBearing = $state(0);
	let mapZoom = $state(18);
	
	let activeDragAxis = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let initialCoordinates = [0, 0];
	let initialAltitude = 0;
	let initialRotation = [0, 0, 0];
	
	function startDrag(e, axis) {
		e.preventDefault();
		e.stopPropagation();
		activeDragAxis = axis;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		initialCoordinates = [...coordinates];
		initialAltitude = altitude;
		initialRotation = modelRotation ? [...modelRotation] : [0, 0, 0];
		
		if (!modelRotation) modelRotation = [0, 0, 0];
		
		window.addEventListener('pointermove', onDrag);
		window.addEventListener('pointerup', endDrag);
		if (map) {
			map.dragPan.disable();
			map.scrollZoom.disable();
			map.dragRotate.disable();
		}
	}
	
	function onDrag(e) {
		if (!activeDragAxis) return;
		
		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;
		
		// Base scaling factor mapped to the exact map zoom level (tuned down)
		const baseScale = 0.05 / Math.pow(2, (mapZoom - 18));
		
		if (activeDragAxis === 'y') {
			// Green Arrow (Altitude)
			const altPitchFactor = 1 / Math.max(0.1, Math.sin(mapPitch * Math.PI / 180));
			altitude = initialAltitude - deltaY * baseScale * altPitchFactor;
		} 
		else if (activeDragAxis === 'x' || activeDragAxis === 'z') {
			// Ground movements
			const pitchFactor = 1 / Math.max(0.1, Math.cos(mapPitch * Math.PI / 180));
			const compensatedDeltaY = deltaY * pitchFactor;
			
			const angle = mapBearing * (Math.PI / 180);
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			
			const groundDeltaX = deltaX * cos + compensatedDeltaY * sin;
			const groundDeltaY = -deltaX * sin + compensatedDeltaY * cos;
			
			// Approximate meters to decimal degrees
			const metersPerDegreeLat = 111320;
			const metersPerDegreeLng = 111320 * Math.cos(initialCoordinates[1] * Math.PI / 180);
			
			if (activeDragAxis === 'x') {
				const deltaLng = (groundDeltaX * baseScale) / metersPerDegreeLng;
				coordinates = [initialCoordinates[0] + deltaLng, coordinates[1]];
			} else if (activeDragAxis === 'z') {
				// Positive groundDeltaY moves SOUTH (negative latitude change)
				const deltaLat = (groundDeltaY * baseScale) / metersPerDegreeLat;
				coordinates = [coordinates[0], initialCoordinates[1] - deltaLat];
			}
		} 
		else if (activeDragAxis === 'ry') {
			const deltaAngle = deltaX * (Math.PI / 180);
			modelRotation = [modelRotation[0], initialRotation[1] + deltaAngle, modelRotation[2]];
		}
		
		if (map) map.triggerRepaint();
	}
	
	function endDrag() {
		activeDragAxis = null;
		window.removeEventListener('pointermove', onDrag);
		window.removeEventListener('pointerup', endDrag);
		if (map) {
			map.dragPan.enable();
			map.scrollZoom.enable();
			map.dragRotate.enable();
		}
	}

	let initialCenter = (coordinates[0] === 0 && coordinates[1] === 0) ? [16.37, 48.20] : coordinates;
	
	if (coordinates[0] === 0 && coordinates[1] === 0) {
		coordinates = initialCenter;
	}

	onMount(async () => {
		let style;
		try {
			const response = await fetch(base + '/terrain.json');
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

		// Removed custom DOM drag/rotate handlers as requested

		customLayer = {
			id: '3d-model',
			type: 'custom',
			renderingMode: '3d',
			onAdd: function (map, gl) {
				console.log('Custom Layer onAdd triggered');
				this.camera = new THREE.PerspectiveCamera();
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
					model.position.set(0, 0, 0);
					const rot = modelRotation || [0, 0, 0];
					model.rotation.set(rot[0], rot[1], rot[2]);
					const scl = modelScale || [1, 1, 1];
					model.scale.set(scl[0], scl[1], scl[2]);
					this.modelGroup.add(model);

					// TransformControls deleted in favor of CSS 3D Gizmo
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
				// The altitude is bound and modified directly by the vertical dragger.
				const modelAltitude = altitude;
				
				// Rotation:
				// X: 90 deg to flip Y-up (GLTF) to Z-up (MapLibre)
				const modelRotate = [Math.PI / 2, 0, 0];

				const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
					coordinates,
					modelAltitude
				);

				const finalScale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

				const rotationX = new THREE.Matrix4().makeRotationAxis(
					new THREE.Vector3(1, 0, 0),
					modelRotate[0]
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
					.multiply(rotationX);
				
				this.lMatrix = l;
				this.camera.projectionMatrix = m.multiply(l);
				
				// Sync screen coordinates and 3D perspective for DOM gizmo!
				if (mapContainer) {
					const modelPos = new THREE.Vector3(0, 0, 0);
					
					// Apply l and m manually to project correctly
					const mCopy = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
					const projection = mCopy.multiply(l);
					modelPos.applyMatrix4(projection);
					
					gizmoX = (modelPos.x + 1) / 2 * mapContainer.offsetWidth;
					gizmoY = (-modelPos.y + 1) / 2 * mapContainer.offsetHeight;
					
					const tr = map.transform;
					mapPitch = tr.pitch;
					mapBearing = tr.bearing;
					mapZoom = map.getZoom();
				}

				// 100% PERFECT PHYSICAL CLONE OF MAPLIBRE CAMERA INTO THREE.JS
				if (this.dummyCamera) {
					const tr = map.transform;
					
					// 1. Sync Aspect Ratio
					this.dummyCamera.aspect = tr.width / tr.height;
					
					// 2. Sync FOV (MapLibre's tr._fov is in radians, ThreeJS is in degrees)
					const fov = tr._fov !== undefined ? tr._fov : 0.6435011087932844;
					this.dummyCamera.fov = fov * (180 / Math.PI);
					this.dummyCamera.updateProjectionMatrix();

					// 3. Sync Position (Translate Mercator to Model Space)
					let camMercator;
					if (typeof map.getFreeCameraOptions === 'function') {
						const fco = map.getFreeCameraOptions();
						camMercator = new THREE.Vector3(fco.position.x, fco.position.y, fco.position.z);
					} else {
						// Fallback if fco not available
						const center = map.getCenter();
						const centerMc = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
						const pitch = tr._pitch || 0;
						const bearing = tr._bearing || 0;
						const alt = tr.cameraToCenterDistance || 1000;
						const worldSize = tr.worldSize || 512;
						
						const yOffset = -Math.cos(pitch) * alt;
						const zOffset = Math.sin(pitch) * alt;
						
						const xOffsetRot = yOffset * Math.sin(bearing);
						const yOffsetRot = yOffset * Math.cos(bearing);
						
						camMercator = new THREE.Vector3(
							centerMc.x + xOffsetRot / worldSize,
							centerMc.y + yOffsetRot / worldSize,
							zOffset / worldSize
						);
					}
					const lInv = new THREE.Matrix4().copy(l).invert();
					camMercator.applyMatrix4(lInv);
					this.dummyCamera.position.copy(camMercator);
					
					// 4. Sync Rotation (Look exactly at the map's center ground point)
					const center = map.getCenter();
					const centerMc = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
					const centerMercatorVec = new THREE.Vector3(centerMc.x, centerMc.y, centerMc.z);
					centerMercatorVec.applyMatrix4(lInv);
					this.dummyCamera.lookAt(centerMercatorVec);
					
					// 5. Finalize matrices for TransformControls raycasting
					this.dummyCamera.updateMatrixWorld(true);
				}

				// Sync Three.js Model to state before rendering
				if (this.modelGroup && this.modelGroup.children.length > 0) {
					const model = this.modelGroup.children[0];
					model.position.set(0, 0, 0);
					const currRot = modelRotation || [0, 0, 0];
					model.rotation.set(currRot[0], currRot[1], currRot[2]);
					const currScale = modelScale || [1, 1, 1];
					model.scale.set(currScale[0], currScale[1], currScale[2]);
				}

				this.renderer.resetState();
				this.renderer.render(this.scene, this.camera);
				this.map.triggerRepaint();
			}
		};

		// Keyboard toggle for Transform modes
		window._handleKeydown = (e) => {
			if (customLayer && customLayer.transformControls) {
				if (e.key === 't' || e.key === 'T') customLayer.transformControls.setMode('translate');
				if (e.key === 'r' || e.key === 'R') customLayer.transformControls.setMode('rotate');
				if (e.key === 's' || e.key === 'S') customLayer.transformControls.setMode('scale');
			}
		};
		window.addEventListener('keydown', window._handleKeydown);

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
		if (map && (coordinates !== undefined || relativeAltitude !== undefined)) {
			map.triggerRepaint();
		}
	});

	onDestroy(() => {
		if (window._centerMarker) {
			window._centerMarker.remove();
			window._centerMarker = null;
		}
		if (window._handleKeydown) {
			window.removeEventListener('keydown', window._handleKeydown);
			window._handleKeydown = null;
		}
		if (customLayer && customLayer.transformControls) {
			customLayer.transformControls.dispose();
		}
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
			<button onclick={onClose} aria-label="Close map" class="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-black/5 transition-none border border-transparent hover:border-black/10">
				<i class="fa-solid fa-xmark text-near-black text-sm"></i>
			</button>
		</div>

		<!-- Map container -->
		<div class="flex-1 relative bg-warm-gray-200 overflow-hidden isolate shadow-inner">
			<div bind:this={mapContainer} class="w-full h-full absolute inset-0 z-0 grayscale-[0.2]"></div>

			<!-- CSS 3D Gizmo Overlay -->
			{#if gizmoX !== -1000}
				<!-- Outer container positioned exactly on the model's screen center -->
				<div 
					class="absolute z-40 pointer-events-none"
					style="left: {gizmoX}px; top: {gizmoY}px; perspective: 1000px;"
				>
					<!-- Inner 3D container perfectly rotated to match MapLibre's camera perspective -->
					<div 
						style="transform-style: preserve-3d; transform: rotateX({mapPitch}deg) rotateZ({-mapBearing}deg);"
					>
						
						<!-- Center Dot -->
						<div class="absolute inset-0 m-auto w-3 h-3 bg-white rounded-full shadow-md border-2 border-gray-800 pointer-events-auto" style="transform: translate(-50%, -50%);"></div>

						<!-- Z-Rotation Ring (Yaw) -->
						<div 
							class="absolute inset-0 m-auto w-32 h-32 rounded-full border-[3px] border-blue-400/50 cursor-grab hover:border-blue-500 pointer-events-auto flex items-center justify-center transition-colors"
							onpointerdown={(e) => startDrag(e, 'ry')}
							style="transform: translate(-50%, -50%);"
							role="slider"
							tabindex="0"
							aria-valuenow={modelRotation?.[1] || 0}
						>
							<div class="absolute -top-[5px] left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full shadow-sm hover:scale-125 transition-transform"></div>
						</div>

						<!-- X Arrow (Red) - Points East -->
						<div 
							class="absolute top-0 left-0 flex items-center cursor-ew-resize pointer-events-auto hover:brightness-125 origin-left group"
							style="transform: translate(0, -50%);"
							onpointerdown={(e) => startDrag(e, 'x')}
							role="slider"
							tabindex="0"
							aria-valuenow={coordinates[0]}
						>
							<div class="w-16 h-[5px] bg-red-500 shadow-sm border border-red-700/50 group-hover:scale-y-150 transition-transform"></div>
							<div class="w-0 h-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-red-500 border-b-[8px] border-b-transparent drop-shadow-sm"></div>
						</div>

						<!-- Z Arrow (Blue) - Points North (Horizontal Depth) -->
						<div 
							class="absolute top-0 left-0 flex flex-col items-center justify-end cursor-ns-resize pointer-events-auto hover:brightness-125 origin-bottom group"
							style="transform: translate(-50%, -100%);"
							onpointerdown={(e) => startDrag(e, 'z')}
							role="slider"
							tabindex="0"
							aria-valuenow={coordinates[1]}
						>
							<div class="w-0 h-0 border-l-[8px] border-l-transparent border-b-[12px] border-b-blue-500 border-r-[8px] border-r-transparent drop-shadow-sm"></div>
							<div class="w-[5px] h-16 bg-blue-500 shadow-sm border border-blue-700/50 group-hover:scale-x-150 transition-transform"></div>
						</div>
						
						<!-- Y Arrow (Green) - Points Up (Vertical) -->
						<div 
							class="absolute top-0 left-0 flex flex-col items-center justify-end cursor-ns-resize pointer-events-auto hover:brightness-125 origin-bottom group"
							style="transform: translate(-50%, -100%) rotateX(-90deg);"
							onpointerdown={(e) => startDrag(e, 'y')}
							role="slider"
							tabindex="0"
							aria-valuenow={altitude}
						>
							<div class="w-0 h-0 border-l-[8px] border-l-transparent border-b-[12px] border-b-green-500 border-r-[8px] border-r-transparent drop-shadow-sm"></div>
							<div class="w-[5px] h-16 bg-green-500 shadow-sm border border-green-700/50 group-hover:scale-x-150 transition-transform"></div>
						</div>
						
					</div>
				</div>
			{/if}

			<!-- Overlay Controls -->
			<div class="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-modal border border-black/15 text-sm font-medium text-warm-gray-500">
				Use <kbd class="px-1.5 py-0.5 bg-black/5 rounded">T</kbd> to Translate, <kbd class="px-1.5 py-0.5 bg-black/5 rounded">R</kbd> to Rotate, <kbd class="px-1.5 py-0.5 bg-black/5 rounded">S</kbd> to Scale
			</div>

			<!-- Move Model Here Button -->
			<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
				<button 
					class="bg-white px-5 py-2.5 rounded-full shadow-modal border border-black/15 text-body-text font-bold text-near-black hover:bg-black/5 transition-none flex items-center gap-2"
					onclick={() => {
						const center = map.getCenter();
						coordinates = [center.lng, center.lat];
						if (window._centerMarker) window._centerMarker.setLngLat(coordinates);
						map.triggerRepaint();
					}}
				>
					<i class="fa-solid fa-location-crosshairs text-creator-blue"></i>
					Move Model Here
				</button>
			</div>

			<!-- Scale Control -->
			<div class="absolute right-6 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-md rounded-full shadow-modal border border-black/15 flex flex-col items-center py-4 px-2 gap-3 w-12">
				<div class="text-[9px] font-bold text-warm-gray-400 uppercase tracking-widest leading-none">Scale</div>
				<label for="model-scale" class="sr-only">Model scale</label>
				<input id="model-scale" type="range" min="0.1" max="10" step="0.1" bind:value={uniformScale} oninput={updateScale} class="studio-range-vertical" style="height: 150px;">
				<div class="text-micro-data font-mono font-bold text-near-black leading-none">{uniformScale.toFixed(1)}x</div>
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
	.studio-range-vertical {
		-webkit-appearance: slider-vertical;
		width: 10px;
		background: transparent;
	}
	.studio-range-vertical::-webkit-slider-thumb {
		-webkit-appearance: none;
		height: 10px;
		width: 10px;
		border-radius: 2px;
		background: #ffffff;
		cursor: pointer;
		border: 2px solid currentColor;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	.studio-range-vertical::-webkit-slider-runnable-track {
		width: 4px;
		height: 100%;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 0px;
	}
</style>

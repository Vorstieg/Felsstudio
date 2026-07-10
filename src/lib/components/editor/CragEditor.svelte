<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import CragEditorLayout from '$lib/components/editor/crag/CragEditorLayout.svelte';
	import CompactAppBar from '$lib/components/editor/crag/CompactAppBar.svelte';
	import MobileToolPill from '$lib/components/editor/crag/MobileToolPill.svelte';
	import CragEditorBottomSheet from '$lib/components/editor/crag/CragEditorBottomSheet.svelte';
	import {
		availableTags,
		commonEquipment,
		CRAG_SESSION_KEY,
		cragTypes,
		rockTypes,
		securityOptions
	} from '$lib/components/editor/crag/crag-editor-options.js';
	import { writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import {
		createPolygonAround,
		getGeometryCenter,
		pathBasename,
		translateGeometryTo
	} from '$lib/assets/js/sector-utils.js';
	import { storage } from '$lib/assets/js/storage-utils.js';
	import { getCragEntryPath, slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';
	import {
		addEquipment,
		addSector,
		createDefaultSector,
		duplicateSectorById,
		moveSectorById,
		removeEquipment,
		removeSectorById
	} from '$lib/components/editor/crag/crag-editor-sectors.js';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.js';
	import { useCragSectorMapEditor } from '$lib/components/editor/crag/use-crag-sector-map-editor.svelte.js';
	import { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.js';
	import {
		buildEditorFeatureCollection,
		createIconMarkerElement,
		ensureCragEditorLayers
	} from '$lib/components/editor/crag/crag-editor-map.js';
	import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.js';


	let { inspectorShadow = true } = $props();

	// Layout flags
	let isCompact = $derived(viewport.isCompact);
	let isMedium = $derived(viewport.isMedium);
	let isExpanded = $derived(viewport.isExpanded);
	let isLandscape = $derived(viewport.isLandscape);
	let isTouch = $derived(viewport.isTouch);

	let map = $state();
	let cragMarker;
	let mapStyle = $state('transport');
	let isMapLoaded = $state(false);
	let saveStatus = $state('idle');
	let saveError = $state('');

	let activeTool = $state('position'); // 'position' | 'transit' | 'parking' | 'track'
	let activeTab = $state('info'); // 'info' | 'registry'
	let selectedSectorId = $state(null);
	let suppressNextMapClick = false;
	let canAutosaveSession = $state(false);
	let autosaveSessionTimeout;

	const trackEditor = useCragTrackEditor({
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value)
	});
	let currentTrackPoints = $derived(trackEditor.currentTrackPoints);
	let editingTrackIndex = $derived(trackEditor.editingTrackIndex);
	let trackDraftMode = $derived(trackEditor.trackDraftMode);
	let isSnappingEnabled = $derived(trackEditor.isSnappingEnabled);
	let isRoutingTrack = $derived(trackEditor.isRoutingTrack);

	const addTrackPoint = (...args) => trackEditor.addTrackPoint(...args);
	const handleTrackConfirm = (...args) => trackEditor.handleTrackConfirm(...args);
	const startRoutingDraft = (...args) => trackEditor.startRoutingDraft(...args);
	const undoTrackPoint = (...args) => trackEditor.undoTrackPoint(...args);
	const removeTrack = (...args) => trackEditor.removeTrack(...args);
	const finalizeTrack = (...args) => trackEditor.finalizeTrack(...args);
	const editTrack = (...args) => trackEditor.editTrack(...args);
	const cancelTrackEdit = (...args) => trackEditor.cancelTrackEdit(...args);
	const handleGpxUpload = (...args) => trackEditor.handleGpxUpload(...args);

	const accessEditor = useCragAccessEditor({
		getMap: () => map,
		getIsMapLoaded: () => isMapLoaded,
		getActiveTool: () => activeTool
	});
	let detectedAssets = $derived(accessEditor.detectedAssets);
	const scanNearbyAssets = (...args) => accessEditor.scanNearbyAssets(...args);
	const setHoverHighlight = (...args) => accessEditor.setHoverHighlight(...args);
	const addDetectedAsset = (...args) => accessEditor.addDetectedAsset(...args);
	const addTransitPoint = (...args) => accessEditor.addTransitPoint(...args);
	const addParkingPoint = (...args) => accessEditor.addParkingPoint(...args);
	const removeTransit = (...args) => accessEditor.removeTransit(...args);
	const removeParking = (...args) => accessEditor.removeParking(...args);

	const sectorMapEditor = useCragSectorMapEditor({
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		getSelectedSectorId: () => selectedSectorId,
		setSelectedSectorId: (value) => (selectedSectorId = value),
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value),
		onUpdateSectorCoordinates: updateSectorCoordinates
	});
	let selectedSectorVertex = $derived(sectorMapEditor.selectedSectorVertex);
	let vertexDeleteUndo = $derived(sectorMapEditor.vertexDeleteUndo);
	let draggingSectorMarkerId = $derived(sectorMapEditor.draggingSectorMarkerId);
	const syncSectorMarkers = (...args) => sectorMapEditor.syncSectorMarkers(...args);
	const undoSectorVertexDelete = (...args) => sectorMapEditor.undoSectorVertexDelete(...args);

	function isBlankCragSession() {
		return (
			!cragEditorState.crag.id &&
			!cragEditorState.crag.name &&
			!cragEditorState.crag.path &&
			!cragEditorState.crag.description_de &&
			!cragEditorState.crag.description_en &&
			(cragEditorState.crag.equipment || []).length === 0 &&
			(cragEditorState.crag.sectors || []).length === 0 &&
			(cragEditorState.transit || []).length === 0 &&
			(cragEditorState.parking || []).length === 0 &&
			(cragEditorState.tracks || []).length === 0
		);
	}

	function restoreLatestCragSession() {
		const session = storage.get(CRAG_SESSION_KEY, null);
		if (!session) return;

		cragEditorState.crag = session.crag || cragEditorState.crag;
		cragEditorState.transit = session.transit || [];
		cragEditorState.parking = session.parking || [];
		cragEditorState.tracks = session.tracks || [];
	}

	function saveLatestCragSession() {
		storage.set(CRAG_SESSION_KEY, {
			crag: $state.snapshot(cragEditorState.crag),
			transit: $state.snapshot(cragEditorState.transit),
			parking: $state.snapshot(cragEditorState.parking),
			tracks: $state.snapshot(cragEditorState.tracks),
			updated: new Date().toISOString()
		});
	}

	function focusSector(sector) {
		selectedSectorId = sector.id;
		activeTool = 'position';
		const center = getGeometryCenter(sector.geometry);
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	onMount(() => {
		if (isBlankCragSession()) restoreLatestCragSession();
		canAutosaveSession = true;

		const handleKeyDown = (e) => {
			if (activeTool === 'track') {
				if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') handleTrackConfirm();
				else if (e.key === 'Escape') cancelTrackEdit();
				else if (e.key === 'Backspace' || e.key === 'Delete') {
					undoTrackPoint();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			sectorMapEditor.cleanup();
			accessEditor.cleanup();
			clearTimeout(autosaveSessionTimeout);
		};
	});

	async function handleMapClick(e) {
		if (suppressNextMapClick) {
			suppressNextMapClick = false;
			return;
		}

		if (
			activeTool === 'track' &&
			currentTrackPoints.length === 0 &&
			map.getLayer('tracks-line-saved')
		) {
			const features = map.queryRenderedFeatures(e.point, { layers: ['tracks-line-saved'] });
			const trackIndex = Number(features[0]?.properties?.trackIndex);
			if (Number.isInteger(trackIndex)) {
				editTrack(trackIndex);
				return;
			}
		}

		if (map.getLayer('detection-points')) {
			const hitRadius = getMapHitRadius(30);
			const bbox = [
				[e.point.x - hitRadius, e.point.y - hitRadius],
				[e.point.x + hitRadius, e.point.y + hitRadius]
			];
			const features = map.queryRenderedFeatures(bbox, { layers: ['detection-points'] });
			if (features.length > 0) {
				const closest = features.reduce((prev, curr) => {
					const prevDist = turf.distance(turf.point(e.lngLat.toArray()), prev);
					const currDist = turf.distance(turf.point(e.lngLat.toArray()), curr);
					return currDist < prevDist ? curr : prev;
				});
				const assetId = closest.properties.id;
				const asset = detectedAssets.find((a) => a.id === assetId);
				if (asset) {
					addDetectedAsset(asset);
					return;
				}
			}
		}

		let lngLat = [e.lngLat.lng, e.lngLat.lat];
		if (activeTool === 'track' && isSnappingEnabled) {
			lngLat = snapToNearestWay(e.point, lngLat);
		}

		if (activeTool === 'position') {
			if (!selectedSectorId) setCragPosition(lngLat);
		} else if (activeTool === 'transit') {
			addTransitPoint(lngLat);
		} else if (activeTool === 'parking') {
			addParkingPoint(lngLat);
		} else if (activeTool === 'track') {
			await addTrackPoint(lngLat);
		}
	}

	$effect(() => {
		if (!canAutosaveSession) return;

		const sessionString = JSON.stringify({
			crag: cragEditorState.crag,
			transit: cragEditorState.transit,
			parking: cragEditorState.parking,
			tracks: cragEditorState.tracks
		});

		if (sessionString) {
			clearTimeout(autosaveSessionTimeout);
			autosaveSessionTimeout = setTimeout(saveLatestCragSession, 1000);
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		syncEditorData();
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		JSON.stringify(cragEditorState.crag.sectors || []);
		selectedSectorId;
		selectedSectorVertex;
		draggingSectorMarkerId;
		untrack(() => {
			if (!draggingSectorMarkerId) syncSectorMarkers();
			syncEditorData();
		});
	});

	$effect(() => {
		const tool = activeTool;
		if (tool === 'parking' || tool === 'transit') {
			setTimeout(() => {
				if (activeTool === tool) scanNearbyAssets(tool === 'parking' ? 'parking' : 'transit');
			}, 300);
		} else {
			accessEditor.clearDetectedAssets();
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		accessEditor.syncDetectionHighlights();
	});


	function snapToNearestWay(point, originalLngLat) {
		if (!map) return originalLngLat;
		const layers = [
			'Path',
			'Track',
			'Minor road',
			'Minor road outline',
			'Main road',
			'Highway',
			'Road construction',
			'snap-helper'
		].filter((id) => map.getLayer(id));
		const features = map.queryRenderedFeatures(
			[
				[point.x - 20, point.y - 20],
				[point.x + 20, point.y + 20]
			],
			{ layers }
		);
		if (features.length === 0) return originalLngLat;
		let closestPoint = null;
		let minDistance = Infinity;
		features.forEach((feature) => {
			if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
				const snapped = turf.nearestPointOnLine(feature, turf.point(originalLngLat));
				const dist = turf.distance(turf.point(originalLngLat), snapped);
				if (dist < minDistance) {
					minDistance = dist;
					closestPoint = snapped.geometry.coordinates;
				}
			}
		});
		return closestPoint || originalLngLat;
	}

	function setCragPositionFromSearch(coordinates) {
		if (!coordinates) return;
		setCragPosition(coordinates);
		if (activeTool === 'parking' || activeTool === 'transit') {
			scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		}
	}

	function setCragPosition(coordinates) {
		cragEditorState.crag.geometry.coordinates = coordinates;
		if (cragMarker) cragMarker.setLngLat(coordinates);
	}

	function locateUser() {
		if (!navigator.geolocation || !map) return;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinates = [position.coords.longitude, position.coords.latitude];
				map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 15), duration: 500 });
				if (activeTool === 'position' && !selectedSectorId) setCragPosition(coordinates);
			},
			() => {
			},
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
		);
	}

	function updateSectorCoordinates(id, coordinates) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id) return sector;
			return {
				...sector,
				geometry: translateGeometryTo(
					sector.geometry || { type: 'Point', coordinates },
					coordinates
				)
			};
		});
	}

	function setSectorGeometryType(id, type) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id || sector.geometry?.type === type) return sector;
			const center = getGeometryCenter(sector.geometry) ||
				cragEditorState.crag.geometry?.coordinates || [0, 0];
			return {
				...sector,
				geometry:
					type === 'Polygon'
						? createPolygonAround(center)
						: { type: 'Point', coordinates: [...center] }
			};
		});
	}

	function initMarkersAndLayers(loadedMap = map) {
		if (!loadedMap) return;
		map = loadedMap;
		ensureCragEditorLayers(loadedMap);

		const markerPos = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		if (cragMarker) cragMarker.remove();
		cragMarker = new maplibregl.Marker({
			element: createIconMarkerElement({
				className: 'crag-marker cursor-move',
				iconUrl: `${base}/icons/sports-climbing.png`,
				size: getMapMarkerSize(32)
			}),
			draggable: true
		})
			.setLngLat(markerPos)
			.addTo(loadedMap);
		cragMarker.on('dragstart', () => {
			accessEditor.clearDetectedAssets();
		});
		cragMarker.on('dragend', () => {
			const pos = cragMarker.getLngLat();
			cragEditorState.crag.geometry.coordinates = [pos.lng, pos.lat];
			if (activeTool === 'parking' || activeTool === 'transit')
				scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		});

		syncSectorMarkers();
		accessEditor.syncAccessMarkers();

		trackEditor.initTrackPointDragHandlers();
		sectorMapEditor.initSectorEditHandlers();
		accessEditor.initDetectionPointHandlers();
		syncEditorData();
	}

	function syncEditorData() {
		const source = map?.getSource('crag-editor-data');
		if (!source) return;
		source.setData(
			buildEditorFeatureCollection({
				sectors: $state.snapshot(cragEditorState.crag.sectors) || [],
				savedTracks: $state.snapshot(cragEditorState.tracks) || [],
				drawingPoints: $state.snapshot(currentTrackPoints) || [],
				selectedSectorId,
				selectedSectorVertex,
				editingTrackIndex
			})
		);
	}

	async function saveToServer() {
		if (!authState.requireAuth(() => saveToServer())) return;

		let savePath = getCragEntryPath(cragEditorState.crag);
		if (!savePath) {
			saveStatus = 'error';
			saveError = 'No path set for this crag.';
			return;
		}
		cragEditorState.crag.path = savePath;

		saveStatus = 'saving';
		saveError = '';

		try {
			const baseName = pathBasename(savePath) || slugifyName(cragEditorState.crag.name);
			cragEditorState.crag.id = cragEditorState.crag.id || baseName;
			ensureCragAssets();

			const uploadedImages = [];
			for (let i = 0; i < cragEditorState.crag.assets.images.length; i++) {
				const image = cragEditorState.crag.assets.images[i];
				if (image._file) {
					const fileName = `${baseName}-image${i > 0 ? '-' + i : ''}-${safeFileName(image.name)}`;
					const path = `${savePath}/${fileName}`;
					await writeFile(path, image._file, image.type || image._file.type);
					uploadedImages.push({ name: image.name, path, type: image.type, size: image.size });
				} else {
					uploadedImages.push({ name: image.name, path: image.path, type: image.type, size: image.size });
				}
			}
			cragEditorState.crag.assets.images = uploadedImages;

			await writeJson(`${savePath}/${baseName}.json`, {
				type: 'Feature',
				properties: {
					...$state.snapshot(cragEditorState.crag),
					id: cragEditorState.crag.id,
					updated: new Date().toISOString().split('T')[0]
				},
				geometry: cragEditorState.crag.geometry
			});

			for (let i = 0; i < cragEditorState.transit.length; i++) {
				const transit = cragEditorState.transit[i];
				await writeJson(`${savePath}/${baseName}-transit${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: { name: transit.name, type: transit.type },
					geometry: { type: 'Point', coordinates: transit.coordinates }
				});
			}

			for (let i = 0; i < cragEditorState.parking.length; i++) {
				const parking = cragEditorState.parking[i];
				await writeJson(`${savePath}/${baseName}-parking${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: { type: 'parking-space' },
					geometry: { type: 'Point', coordinates: parking.coordinates }
				});
			}

			for (let i = 0; i < cragEditorState.tracks.length; i++) {
				const track = cragEditorState.tracks[i];
				await writeJson(`${savePath}/${baseName}-transit-track${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: track.coordinates }
				});
			}

			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (err) {
			console.error('Save failed:', err);
			saveStatus = 'error';
			saveError = err.message;
		}
	}

	function addEquipmentItem() {
		cragEditorState.crag.equipment = addEquipment(cragEditorState.crag.equipment);
	}

	function removeEquipmentItem(idx) {
		cragEditorState.crag.equipment = removeEquipment(cragEditorState.crag.equipment, idx);
	}

	function ensureCragAssets() {
		if (!cragEditorState.crag.assets) cragEditorState.crag.assets = { images: [] };
		if (!cragEditorState.crag.assets.images) cragEditorState.crag.assets.images = [];
	}

	function safeFileName(name = 'image') {
		const extension = name.includes('.') ? `.${name.split('.').pop()}` : '';
		const base = name.replace(/\.[^/.]+$/, '') || 'image';
		return `${slugifyName(base) || 'image'}${extension.toLowerCase()}`;
	}

	function addCragImages(files = []) {
		ensureCragAssets();
		const images = files
			.filter((file) => file?.type?.startsWith('image/'))
			.map((file) => ({
				name: file.name,
				type: file.type,
				size: file.size,
				previewUrl: URL.createObjectURL(file),
				_file: file
			}));
		cragEditorState.crag.assets.images = [...cragEditorState.crag.assets.images, ...images];
	}

	function removeCragImage(index) {
		ensureCragAssets();
		const image = cragEditorState.crag.assets.images[index];
		if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
		cragEditorState.crag.assets.images = cragEditorState.crag.assets.images.filter((_, i) => i !== index);
	}

	function createSector() {
		const sectors = cragEditorState.crag.sectors || [];
		const sector = createDefaultSector({
			sectors,
			cragCoordinates: cragEditorState.crag.geometry.coordinates
		});
		cragEditorState.crag.sectors = addSector(sectors, sector);
		selectedSectorId = sector.id;
		activeTab = 'sectors';
		activeTool = 'position';
	}

	function duplicateSector(id) {
		const result = duplicateSectorById(cragEditorState.crag.sectors || [], id);
		if (!result.duplicatedId) return;
		cragEditorState.crag.sectors = result.sectors;
		selectedSectorId = result.duplicatedId;
		activeTab = 'sectors';
	}

	function removeSector(id) {
		cragEditorState.crag.sectors = removeSectorById(cragEditorState.crag.sectors || [], id);
		if (selectedSectorId === id) selectedSectorId = null;
	}

	function moveSector(id, direction) {
		cragEditorState.crag.sectors = moveSectorById(
			cragEditorState.crag.sectors || [],
			id,
			direction
		);
	}
</script>

<CragEditorMap
	bind:map
	bind:isMapLoaded
	bind:mapStyle
	initialCoordinates={$state.snapshot(cragEditorState.crag.geometry.coordinates)}
	onStyleLoad={initMarkersAndLayers}
	onMapClick={handleMapClick}
/>

<CragEditorLayout
	{inspectorShadow}
	{map}
	{isExpanded}
	{isCompact}
	{isMedium}
	{isLandscape}
	{CompactAppBar}
	{MobileToolPill}
	{CragEditorBottomSheet}
	bind:activeTool
	bind:mapStyle
	bind:activeTab
	{detectedAssets}
	bind:selectedSectorId
	{currentTrackPoints}
	{editingTrackIndex}
	{trackDraftMode}
	{isRoutingTrack}
	{cragTypes}
	{availableTags}
	{securityOptions}
	{rockTypes}
	{commonEquipment}
	{saveStatus}
	{saveError}
	onBack={() => goto(base + '/')}
	onStartRoutingDraft={startRoutingDraft}
	onHandleTrackConfirm={handleTrackConfirm}
	onCancelTrackEdit={cancelTrackEdit}
	onGpxUpload={handleGpxUpload}
	onExport={saveToServer}
	onUseSearchPosition={setCragPositionFromSearch}
	onLocateUser={locateUser}
	onAddEquipmentItem={addEquipmentItem}
	onRemoveEquipmentItem={removeEquipmentItem}
	onAddCragImages={addCragImages}
	onRemoveCragImage={removeCragImage}
	onAddSector={createSector}
	onDuplicateSector={duplicateSector}
	onRemoveSector={removeSector}
	onMoveSector={moveSector}
	onSetSectorGeometryType={setSectorGeometryType}
	onFocusSector={focusSector}
	onSetHoverHighlight={setHoverHighlight}
	onClearDetectedAssets={accessEditor.clearDetectedAssets}
	onAddDetectedAsset={addDetectedAsset}
	onRemoveTransit={removeTransit}
	onRemoveParking={removeParking}
	onEditTrack={editTrack}
	onRemoveTrack={removeTrack}
	onFinalizeTrack={finalizeTrack}
	{vertexDeleteUndo}
	onUndoSectorVertexDelete={undoSectorVertexDelete}
/>
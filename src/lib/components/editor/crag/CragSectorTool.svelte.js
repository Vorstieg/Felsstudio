import {
	createPolygonAround,
	getGeometryCenter,
	translateGeometryTo
} from '$lib/assets/js/sector-utils.js';
import {
	addSector,
	createDefaultSector,
	duplicateSectorById,
	removeSectorById
} from './crag-editor-sectors.ts';

/** Core sector mutations and selection/focus workflows for the crag editor. */
export function createCragSectorTool({
	state,
	getMap,
	getSelection,
	selectObject,
	setActiveTool,
	setActiveTab
} = {}) {
	function ensureMapLayers(map = getMap()) {
		if (!map) return;
		if (!map.getSource('sector-editor-data'))
			map.addSource('sector-editor-data', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		const layers = [
			{
				id: 'sector-polygons-fill',
				type: 'fill',
				filter: ['==', ['get', 'feature'], 'sector'],
				paint: {
					'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
				}
			},
			{
				id: 'sector-polygons-outline',
				type: 'line',
				filter: ['==', ['get', 'feature'], 'sector'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: {
					'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'line-width': ['case', ['==', ['get', 'selected'], true], 3, 2],
					'line-opacity': 0.9
				}
			}
		];
		for (const layer of layers)
			if (!map.getLayer(layer.id)) {
				const before = map.getLayer('tracks-line-saved') ? 'tracks-line-saved' : undefined;
				map.addLayer({ ...layer, source: 'sector-editor-data' }, before);
			}
	}

	function syncDrawing() {
		const map = getMap();
		if (!map) return;
		ensureMapLayers(map);
		const features = [];
		(state.crag.sectors || []).forEach((sector) => {
			if (sector.geometry?.type !== 'Polygon') return;
			const selected = getSelection()?.type === 'sector' && getSelection().id === sector.id;
			features.push({
				type: 'Feature',
				geometry: sector.geometry,
				properties: {
					feature: 'sector',
					id: sector.id || '',
					name: sector.name || '',
					selected
				}
			});
		});
		map.getSource('sector-editor-data')?.setData({ type: 'FeatureCollection', features });
	}
	function focusSector(sector) {
		selectObject({ type: 'sector', id: sector.id });
		setActiveTool('geometry');
		const center = getGeometryCenter(sector.geometry);
		const map = getMap();
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function createSector() {
		const sectors = state.crag.sectors || [];
		const sector = createDefaultSector({
			sectors,
			cragCoordinates: getGeometryCenter(state.crag.geometry) || [0, 0]
		});
		state.setSectors(addSector(sectors, sector));
		selectObject({ type: 'sector', id: sector.id });
		setActiveTab('info');
		setActiveTool('geometry');
	}

	function duplicateSector(id) {
		const result = duplicateSectorById(state.crag.sectors || [], id);
		if (!result.duplicatedId) return;
		state.setSectors(result.sectors);
		selectObject({ type: 'sector', id: result.duplicatedId });
		setActiveTab('info');
	}

	function removeSector(id) {
		state.setSectors(removeSectorById(state.crag.sectors || [], id));
		const selection = getSelection?.();
		if (selection?.type === 'sector' && selection.id === id) {
			const current = state.hierarchyEntries?.find((entry) => entry.isCurrent);
			selectObject(current ? { type: 'entry', key: current.key } : null);
		}
	}

	function setSectorGeometryType(id, type) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) => {
				if (sector.id !== id || sector.geometry?.type === type) return sector;
				const center = getGeometryCenter(sector.geometry) ||
					getGeometryCenter(state.crag.geometry) || [0, 0];
				return {
					...sector,
					geometry:
						type === 'Polygon'
							? createPolygonAround(center)
							: { type: 'Point', coordinates: [...center] }
				};
			})
		);
	}

	function updateSectorCoordinates(id, coordinates) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) =>
				sector.id !== id
					? sector
					: {
							...sector,
							geometry: translateGeometryTo(
								sector.geometry || { type: 'Point', coordinates },
								coordinates
							)
						}
			)
		);
	}

	function updateSectorGeometry(id, updater) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) =>
				sector.id === id ? { ...sector, geometry: updater(sector.geometry) } : sector
			)
		);
	}

	return {
		ensureMapLayers,
		syncDrawing,
		focusSector,
		createSector,
		duplicateSector,
		removeSector,
		setSectorGeometryType,
		updateSectorCoordinates,
		updateSectorGeometry
	};
}

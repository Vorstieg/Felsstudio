import { createPolygonAround, getGeometryCenter, translateGeometryTo } from '$lib/assets/js/sector-utils.js';
import {
	addSector,
	createDefaultSector,
	duplicateSectorById,
	moveSectorById,
	removeSectorById
} from './crag-editor-sectors.js';

/** Core sector mutations and selection/focus workflows for the crag editor. */
export function createCragSectorTool({ state, getMap, getSelection, selectObject, setActiveTool, setActiveTab } = {}) {
	function focusSector(sector) {
		selectObject({ type: 'sector', id: sector.id });
		setActiveTool('position');
		const center = getGeometryCenter(sector.geometry);
		const map = getMap();
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function createSector() {
		const sectors = state.crag.sectors || [];
		const sector = createDefaultSector({ sectors, cragCoordinates: state.crag.geometry.coordinates });
		state.setSectors(addSector(sectors, sector));
		selectObject({ type: 'sector', id: sector.id });
		setActiveTab('sectors');
		setActiveTool('position');
	}

	function duplicateSector(id) {
		const result = duplicateSectorById(state.crag.sectors || [], id);
		if (!result.duplicatedId) return;
		state.setSectors(result.sectors);
		selectObject({ type: 'sector', id: result.duplicatedId });
		setActiveTab('sectors');
	}

	function removeSector(id) {
		state.setSectors(removeSectorById(state.crag.sectors || [], id));
		const selection = getSelection?.();
		if (selection?.type === 'sector' && selection.id === id) selectObject(null);
	}

	function moveSector(id, direction) {
		state.setSectors(moveSectorById(state.crag.sectors || [], id, direction));
	}

	function setSectorGeometryType(id, type) {
		state.setSectors((state.crag.sectors || []).map((sector) => {
			if (sector.id !== id || sector.geometry?.type === type) return sector;
			const center = getGeometryCenter(sector.geometry) || state.crag.geometry?.coordinates || [0, 0];
			return {
				...sector,
				geometry: type === 'Polygon'
					? createPolygonAround(center)
					: { type: 'Point', coordinates: [...center] }
			};
		}));
	}

	function updateSectorCoordinates(id, coordinates) {
		state.setSectors((state.crag.sectors || []).map((sector) => sector.id !== id
			? sector
			: { ...sector, geometry: translateGeometryTo(sector.geometry || { type: 'Point', coordinates }, coordinates) }));
	}

	function updateSectorGeometry(id, updater) {
		state.setSectors((state.crag.sectors || []).map((sector) =>
			sector.id === id ? { ...sector, geometry: updater(sector.geometry) } : sector
		));
	}

	return {
		focusSector,
		createSector,
		duplicateSector,
		removeSector,
		moveSector,
		setSectorGeometryType,
		updateSectorCoordinates,
		updateSectorGeometry
	};
}

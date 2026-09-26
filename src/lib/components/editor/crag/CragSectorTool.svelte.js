import {
	createPolygonAround,
	getGeometryCenter,
	translateGeometryTo
} from '$lib/assets/js/sector-utils.js';
import { createFelsEntry } from '$lib/state/crag-session.svelte.ts';

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
				filter: ['==', ['get', 'feature'], 'child-entry'],
				paint: {
					'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
				}
			},
			{
				id: 'sector-polygons-outline',
				type: 'line',
				filter: ['==', ['get', 'feature'], 'child-entry'],
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
		state.getActiveSectors().forEach((node) => {
			const sector = node.entry?.properties;
			const geometry = node.entry?.geometry;
			if (!sector || geometry?.type !== 'Polygon') return;
			const path = state.getWorkspaceEntryPath(node);
			const selected = getSelection()?.type === 'entry' && getSelection().key === path;
			features.push({
				type: 'Feature',
				geometry,
				properties: {
					feature: 'child-entry',
					id: sector.id || '',
					path,
					name: sector.name || '',
					selected
				}
			});
		});
		map.getSource('sector-editor-data')?.setData({ type: 'FeatureCollection', features });
	}
	function focusSector(node, { select = true } = {}) {
		if (select && node?.entry)
			selectObject({ type: 'entry', key: state.getWorkspaceEntryPath(node) });
		setActiveTool('geometry');
		const center = getGeometryCenter(node?.entry?.geometry);
		const map = getMap();
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function createSector() {
		let next = 1;
		while (state.getActiveSectors().some((node) => node.entry?.properties.id === `child-${next}`))
			next++;
		const entry = createFelsEntry('area', { id: `child-${next}`, name: `Child ${next}` });
		entry.geometry = state.getActiveEntry()?.geometry || entry.geometry;
		const node = state.createWorkspaceEntry(entry);
		if (!node) return;
		selectObject({ type: 'entry', key: state.getWorkspaceEntryPath(node) });
		setActiveTab('info');
		setActiveTool('geometry');
	}

	function duplicateSector(id) {
		const source = state.getActiveSectors().find((node) => node.entry?.properties.id === id)?.entry;
		if (!source) return;
		let duplicateId = `${id}-copy`;
		let count = 2;
		while (state.getActiveSectors().some((node) => node.entry?.properties.id === duplicateId))
			duplicateId = `${id}-copy-${count++}`;
		const duplicate = JSON.parse(JSON.stringify(source));
		duplicate.properties.id = duplicateId;
		duplicate.properties.name = `${source.properties.name || id} Copy`;
		const node = state.createWorkspaceEntry(duplicate);
		if (!node) return;
		selectObject({ type: 'entry', key: state.getWorkspaceEntryPath(node) });
		setActiveTab('info');
	}

	function removeSector(id) {
		const active = state.getActiveWorkspaceEntry();
		const node =
			active?.childEntries.find((child) => child.entry?.properties.id === id) ||
			(active?.entry?.properties.id === id && state.getWorkspaceEntry(active.path) ? active : null);
		if (!node) return;
		const childPath = state.getWorkspaceEntryPath(node);
		const parentPath = node.path;
		const wasActive = state.activeWorkspaceEntryPath === childPath;
		state.removeWorkspaceEntry(childPath);
		const selection = getSelection?.();
		if (wasActive || (selection?.type === 'entry' && selection.key === childPath))
			selectObject({ type: 'entry', key: parentPath });
	}

	function setSectorGeometryType(id, type) {
		const node = state
			.getActiveSectors()
			.find((candidate) => candidate.entry?.properties.id === id);
		if (!node?.entry || node.entry.geometry?.type === type) return;
		const center = getGeometryCenter(node.entry.geometry) ||
			getGeometryCenter(state.getActiveEntry()?.geometry) || [0, 0];
		state.commitGeometry(
			state.getWorkspaceEntryPath(node),
			type === 'Polygon'
				? createPolygonAround(center)
				: { type: 'Point', coordinates: [...center] },
			'Change sector geometry'
		);
	}

	function moveSectorPosition(id, coordinates) {
		const node = state
			.getActiveSectors()
			.find((candidate) => candidate.entry?.properties.id === id);
		if (!node?.entry) return;
		state.commitGeometry(
			state.getWorkspaceEntryPath(node),
			translateGeometryTo(node.entry.geometry || { type: 'Point', coordinates }, coordinates),
			'Move sector'
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
		moveSectorPosition
	};
}

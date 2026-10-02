import type { Map, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import type { CragEditorSession, FelsEntryWorkspace } from '$lib/types/crag';
import type { PointOrAreaGeometry } from '@vorstieg/fels-types/types';
import {
	createPolygonAround,
	getGeometryCenter,
	translateGeometryTo
} from '$lib/assets/js/sector-utils.ts';
import { createFelsEntry } from '$lib/state/crag-session.svelte.ts';
import type { CragSelection } from './crag-route-types.ts';

type MapPoint = [number, number];
type SectorGeometryType = 'Point' | 'Polygon';

type CragSectorToolOptions = {
	state: CragEditorSession;
	getMap: () => Map | null | undefined;
	getSelection: () => CragSelection | null;
	selectObject: (selection: CragSelection | null) => void;
	setActiveTool: (tool: string) => void;
	setActiveTab: (tab: string) => void;
};

/** Core sector mutations and selection/focus workflows for the crag editor. */
export function createCragSectorTool({
	state,
	getMap,
	getSelection,
	selectObject,
	setActiveTool,
	setActiveTab
}: CragSectorToolOptions) {
	function ensureMapLayers(map = getMap()) {
		if (!map) return;
		if (!map.getSource('sector-editor-data'))
			map.addSource('sector-editor-data', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		const layers: LayerSpecification[] = [
			{
				id: 'sector-polygons-fill',
				type: 'fill',
				source: 'sector-editor-data',
				filter: ['==', ['get', 'feature'], 'child-entry'],
				paint: {
					'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
				}
			},
			{
				id: 'sector-polygons-outline',
				type: 'line',
				source: 'sector-editor-data',
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
				map.addLayer(layer, before);
			}
	}

	function syncDrawing() {
		const map = getMap();
		if (!map) return;
		ensureMapLayers(map);
		const features = state.getActiveSectors().flatMap((node) => {
			const sector = node.entry?.properties;
			const geometry = node.entry?.geometry;
			if (!sector || geometry?.type !== 'Polygon') return [];
			const path = state.getWorkspaceEntryPath(node);
			const selection = getSelection();
			return [
				{
					type: 'Feature' as const,
					geometry,
					properties: {
						feature: 'child-entry',
						id: sector.id || '',
						path,
						name: sector.name || '',
						selected: selection?.type === 'entry' && selection.key === path
					}
				}
			];
		});
		(map.getSource('sector-editor-data') as GeoJSONSource | undefined)?.setData({
			type: 'FeatureCollection',
			features: features as never
		});
	}

	function focusSector(
		node: FelsEntryWorkspace | null,
		{ select = true }: { select?: boolean } = {}
	) {
		if (select && node?.entry)
			selectObject({ type: 'entry', key: state.getWorkspaceEntryPath(node) });
		setActiveTool('geometry');
		const center = getGeometryCenter(node?.entry?.geometry) as MapPoint | null;
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

	function duplicateSector(id: string) {
		const source = state.getActiveSectors().find((node) => node.entry?.properties.id === id)?.entry;
		if (!source) return;
		let duplicateId = `${id}-copy`;
		let count = 2;
		while (state.getActiveSectors().some((node) => node.entry?.properties.id === duplicateId))
			duplicateId = `${id}-copy-${count++}`;
		const duplicate = structuredClone(source);
		duplicate.properties.id = duplicateId;
		duplicate.properties.name = `${source.properties.name || id} Copy`;
		const node = state.createWorkspaceEntry(duplicate);
		if (!node) return;
		selectObject({ type: 'entry', key: state.getWorkspaceEntryPath(node) });
		setActiveTab('info');
	}

	function removeSector(id: string) {
		const active = state.getActiveWorkspaceEntry();
		const node =
			active?.childEntries.find((child) => child.entry?.properties.id === id) ||
			(active?.entry?.properties.id === id && state.getWorkspaceEntry(active.path) ? active : null);
		if (!node) return;
		const childPath = state.getWorkspaceEntryPath(node);
		const parentPath = node.path;
		const wasActive = state.activeWorkspaceEntryPath === childPath;
		state.removeWorkspaceEntry(childPath);
		const selection = getSelection();
		if (wasActive || (selection?.type === 'entry' && selection.key === childPath))
			selectObject({ type: 'entry', key: parentPath });
	}

	function setSectorGeometryType(id: string, type: SectorGeometryType) {
		const node = state
			.getActiveSectors()
			.find((candidate) => candidate.entry?.properties.id === id);
		if (!node?.entry || node.entry.geometry?.type === type) return;
		const center = (getGeometryCenter(node.entry.geometry) ||
			getGeometryCenter(state.getActiveEntry()?.geometry) || [0, 0]) as MapPoint;
		const geometry: PointOrAreaGeometry =
			type === 'Polygon'
				? (createPolygonAround(center) as PointOrAreaGeometry)
				: { type: 'Point', coordinates: [...center] };
		state.commitGeometry(state.getWorkspaceEntryPath(node), geometry, 'Change sector geometry');
	}

	function moveSectorPosition(id: string, coordinates: MapPoint) {
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

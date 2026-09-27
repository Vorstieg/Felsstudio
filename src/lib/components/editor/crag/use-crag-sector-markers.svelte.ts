import maplibregl from 'maplibre-gl';
import type { Map, Marker } from 'maplibre-gl';
import type { CragEditorSession } from '$lib/types/crag';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.ts';
import type { CragSelection } from './crag-route-types.ts';

type SectorMarkerOptions = {
	state: CragEditorSession;
	getMap: () => Map | null | undefined;
	getSelection: () => CragSelection | null;
	selectObject: (selection: CragSelection | null) => void;
	setActiveTab: (tab: string) => void;
};

export function useCragSectorMarkers({
	state,
	getMap,
	getSelection,
	selectObject,
	setActiveTab
}: SectorMarkerOptions) {
	let markers: Marker[] = [];

	function sync() {
		const map = getMap();
		if (!map) return;
		for (const item of markers) item.remove();
		markers = [];
		for (const node of state.getActiveSectors()) {
			const sector = node.entry?.properties;
			if (!sector) continue;
			const coordinates = getGeometryCenter(node.entry?.geometry);
			if (!coordinates) continue;
			const element = document.createElement('button');
			element.type = 'button';
			const path = state.getWorkspaceEntryPath(node);
			const selection = getSelection();
			element.className = `sector-marker ${selection?.type === 'entry' && selection.key === path ? 'is-selected' : ''}`;
			element.title = sector.name || sector.id || 'Sector';
			element.innerHTML = `<span>${sector.id || 'S'}</span>`;
			element.addEventListener('click', (event) => {
				event.stopPropagation();
				selectObject({ type: 'entry', key: path });
				setActiveTab('info');
			});
			markers.push(
				new maplibregl.Marker({ element, draggable: false }).setLngLat(coordinates).addTo(map)
			);
		}
	}

	function cleanup() {
		for (const marker of markers) marker.remove();
		markers = [];
	}

	return { sync, cleanup };
}

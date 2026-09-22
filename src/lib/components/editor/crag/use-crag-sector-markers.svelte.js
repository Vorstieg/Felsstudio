import maplibregl from 'maplibre-gl';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';

export function useCragSectorMarkers({ state, getMap, getSelection, selectObject, setActiveTab }) {
	let markers = [];

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
			element.className = `sector-marker ${getSelection()?.type === 'entry' && getSelection().key === path ? 'is-selected' : ''}`;
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

import maplibregl from 'maplibre-gl';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';

export function useCragSectorMarkers({ state, getMap, getSelection, selectObject, setActiveTab }) {
	let markers = [];

	function sync() {
		const map = getMap();
		if (!map) return;
		for (const item of markers) item.remove();
		markers = [];
		for (const sector of state.crag.sectors || []) {
			const coordinates = getGeometryCenter(sector.geometry);
			if (!coordinates) continue;
			const element = document.createElement('button');
			element.type = 'button';
			element.className = `sector-marker ${getSelection()?.type === 'sector' && getSelection().id === sector.id ? 'is-selected' : ''}`;
			element.title = sector.name || sector.id || 'Sector';
			element.innerHTML = `<span>${sector.id || 'S'}</span>`;
			element.addEventListener('click', (event) => {
				event.stopPropagation();
				selectObject({ type: 'sector', id: sector.id });
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

import { base } from '$app/paths';
import { maptilerApiKey } from '$lib/config';

const MAPTILER_KEY_PLACEHOLDER = '{MAPTILER_API_KEY}';
const FALLBACK_STYLE = 'https://demotiles.maplibre.org/style.json';

export function maptilerTilesUrl(tileset = 'v3') {
	if (!maptilerApiKey) return null;
	return `https://api.maptiler.com/tiles/${tileset}/tiles.json?key=${encodeURIComponent(maptilerApiKey)}`;
}

export async function loadMapStyle(name) {
	if (!maptilerApiKey) {
		console.warn(
			'MapTiler is not configured; using the fallback map style. Set VITE_MAPTILER_API_KEY.'
		);
		return FALLBACK_STYLE;
	}

	const response = await fetch(`${base}/${name}.json`);
	if (!response.ok) throw new Error(`Unable to load ${name} map style (${response.status})`);
	return JSON.parse(
		(await response.text()).replaceAll(MAPTILER_KEY_PLACEHOLDER, encodeURIComponent(maptilerApiKey))
	);
}

import { Protocol } from 'pmtiles';
import type maplibregl from 'maplibre-gl';

const archiveUrl = 'https://lager.felsverzeichnis.at/api/tiles/via-ferrata.pmtiles';
let registered = false;

/** Register once for all map instances and style changes. */
export function registerCustomTiles(maplibre: Pick<typeof maplibregl, 'addProtocol'>): void {
	if (registered) return;
	maplibre.addProtocol('pmtiles', new Protocol().tile);
	registered = true;
}

/** Keep static map styles usable while allowing a local Felslager archive. */
export function transformTileRequest(url: string, tilesUrl: string): { url: string } {
	const prefix = `pmtiles://${archiveUrl}`;
	return { url: url.startsWith(prefix) ? `pmtiles://${tilesUrl}${url.slice(prefix.length)}` : url };
}

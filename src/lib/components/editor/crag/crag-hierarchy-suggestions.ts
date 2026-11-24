import * as turf from '@turf/turf';
import type { EntryKind, FelsEntry } from '@vorstieg/fels-types/types';
import { normalizePath, slugifyName } from './crag-editor-paths.ts';

export type HierarchyManifestEntry = Pick<FelsEntry, 'geometry'> & {
	entryPath: string;
	properties: Pick<FelsEntry['properties'], 'id' | 'name' | 'kind'> & {
		type?: string[];
	};
};

export type HierarchySuggestionSource = 'polygon' | 'geocoder';

export type HierarchySuggestion = {
	parentPath: string;
	source: HierarchySuggestionSource;
	label: string;
	matchedKind?: EntryKind;
	isNewFolder: boolean;
};

type GeocoderFeature = {
	text?: string;
	text_en?: string;
	place_type?: string[];
	properties?: {
		country_code?: string;
		short_code?: string;
		kind?: string;
	};
	context?: Array<{
		id?: string;
		text?: string;
		text_en?: string;
		country_code?: string;
		short_code?: string;
	}>;
};

type GeocoderResponse = { features?: GeocoderFeature[] };

const ALLOWED_PARENT_KINDS: Record<string, readonly EntryKind[]> = {
	sector: ['crag', 'area', 'region', 'country'],
	crag: ['area', 'region', 'country'],
	area: ['region', 'country'],
	region: ['country'],
	country: []
};

const KIND_SPECIFICITY: Record<string, number> = {
	crag: 4,
	area: 3,
	region: 2,
	country: 1
};

const SUFFICIENT_POLYGON_KINDS: Record<string, readonly EntryKind[]> = {
	sector: ['crag', 'area'],
	crag: ['area', 'region'],
	area: ['region'],
	region: ['country'],
	country: []
};

const EUROPE_CODES = new Set([
	'AD',
	'AL',
	'AT',
	'BA',
	'BE',
	'BG',
	'BY',
	'CH',
	'CY',
	'CZ',
	'DE',
	'DK',
	'EE',
	'ES',
	'FI',
	'FO',
	'FR',
	'GB',
	'GI',
	'GR',
	'HR',
	'HU',
	'IE',
	'IS',
	'IT',
	'LI',
	'LT',
	'LU',
	'LV',
	'MC',
	'MD',
	'ME',
	'MK',
	'MT',
	'NL',
	'NO',
	'PL',
	'PT',
	'RO',
	'RS',
	'SE',
	'SI',
	'SK',
	'SM',
	'UA',
	'VA',
	'XK'
]);

const NORTH_AMERICA_CODES = new Set([
	'BZ',
	'CA',
	'CR',
	'CU',
	'DO',
	'GL',
	'GT',
	'HN',
	'HT',
	'JM',
	'MX',
	'NI',
	'PA',
	'PR',
	'SV',
	'US'
]);

const SOUTH_AMERICA_CODES = new Set([
	'AR',
	'BO',
	'BR',
	'CL',
	'CO',
	'EC',
	'GF',
	'GY',
	'PE',
	'PY',
	'SR',
	'UY',
	'VE'
]);

const OCEANIA_CODES = new Set(['AU', 'FJ', 'NC', 'NZ', 'PG', 'WS']);

const AFRICA_CODES = new Set([
	'AO',
	'BW',
	'CM',
	'DZ',
	'EG',
	'ET',
	'GH',
	'KE',
	'MA',
	'MG',
	'MU',
	'NA',
	'NG',
	'RE',
	'TN',
	'TZ',
	'UG',
	'ZA',
	'ZM',
	'ZW'
]);

const ASIA_CODES = new Set([
	'AE',
	'AM',
	'AZ',
	'CN',
	'GE',
	'HK',
	'ID',
	'IL',
	'IN',
	'IR',
	'JO',
	'JP',
	'KG',
	'KH',
	'KR',
	'KZ',
	'LA',
	'LB',
	'LK',
	'MM',
	'MN',
	'MY',
	'NP',
	'OM',
	'PH',
	'PK',
	'SA',
	'SG',
	'TH',
	'TJ',
	'TR',
	'TW',
	'UZ',
	'VN'
]);

export function continentSlugForCountryCode(countryCode?: string | null): string | null {
	const code = String(countryCode || '')
		.trim()
		.slice(0, 2)
		.toUpperCase();
	if (!code) return null;
	if (EUROPE_CODES.has(code)) return 'europe';
	if (NORTH_AMERICA_CODES.has(code)) return 'north-america';
	if (SOUTH_AMERICA_CODES.has(code)) return 'south-america';
	if (OCEANIA_CODES.has(code)) return 'oceania';
	if (AFRICA_CODES.has(code)) return 'africa';
	if (ASIA_CODES.has(code)) return 'asia';
	return null;
}

function isValidCoordinate(
	coords: [number, number] | null | undefined
): coords is [number, number] {
	if (!Array.isArray(coords) || coords.length < 2) return false;
	const [lng, lat] = coords;
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
	if (lng === 0 && lat === 0) return false;
	return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function isExcludedPath(candidatePath: string, excludePath?: string | null): boolean {
	const normalizedExclude = normalizePath(excludePath || '');
	if (!normalizedExclude) return false;
	return candidatePath === normalizedExclude || candidatePath.startsWith(`${normalizedExclude}/`);
}

function pathDepth(path: string): number {
	return normalizePath(path).split('/').filter(Boolean).length;
}

function isPolygonGeometry(geometry: FelsEntry['geometry'] | null | undefined): boolean {
	return (
		geometry?.type === 'Polygon' || (geometry as { type?: string } | null)?.type === 'MultiPolygon'
	);
}

function inferManifestEntryKind(entry: HierarchyManifestEntry): EntryKind | null {
	if (entry.properties?.kind) return entry.properties.kind;
	const depth = pathDepth(entry.entryPath);
	if (depth === 2) return 'country';
	if (depth === 3) return 'region';
	if (depth >= 4 && depth <= 5 && (!entry.properties?.type || entry.properties.type.length === 0)) {
		return 'area';
	}
	return depth >= 4 ? 'crag' : null;
}

/** Tier 1: Exact point-in-polygon containment against existing manifest polygons. */
export function findPolygonHierarchySuggestions({
	coordinates,
	entryKind,
	manifestEntries = [],
	excludePath = null
}: {
	coordinates: [number, number] | null | undefined;
	entryKind?: string | null;
	manifestEntries?: readonly HierarchyManifestEntry[];
	excludePath?: string | null;
}): HierarchySuggestion[] {
	if (!isValidCoordinate(coordinates)) return [];
	const allowed = ALLOWED_PARENT_KINDS[entryKind || 'crag'] ?? ALLOWED_PARENT_KINDS.crag;

	const point = turf.point(coordinates);
	const matches: Array<{
		entry: HierarchyManifestEntry;
		kind: EntryKind;
		path: string;
		kindRank: number;
		depth: number;
		area: number;
	}> = [];

	for (const entry of manifestEntries) {
		const path = normalizePath(entry.entryPath);
		if (!path || isExcludedPath(path, excludePath)) continue;
		const depth = pathDepth(path);
		const isContinent = depth === 1;
		const kind = inferManifestEntryKind(entry);
		if (!isContinent && (!kind || !allowed.includes(kind))) continue;
		if (isContinent && (entryKind || 'crag') === 'sector' && !allowed.length) continue;
		if (!isPolygonGeometry(entry.geometry)) continue;

		try {
			if (!turf.booleanPointInPolygon(point, entry.geometry as never)) continue;
			const area = turf.area(entry.geometry as never);
			matches.push({
				entry,
				kind: kind || 'region',
				path,
				kindRank: isContinent ? 0 : KIND_SPECIFICITY[kind || ''] || 0,
				depth,
				area: Number.isFinite(area) ? area : Number.MAX_SAFE_INTEGER
			});
		} catch {
			// Skip malformed or unclosed polygons safely.
		}
	}

	matches.sort((a, b) => {
		if (b.kindRank !== a.kindRank) return b.kindRank - a.kindRank;
		if (b.depth !== a.depth) return b.depth - a.depth;
		return a.area - b.area;
	});

	const seen = new Set<string>();
	const suggestions: HierarchySuggestion[] = [];
	for (const match of matches) {
		if (seen.has(match.path)) continue;
		seen.add(match.path);
		const fallbackName = match.path.split('/').at(-1) || match.path;
		suggestions.push({
			parentPath: match.path,
			source: 'polygon',
			label: match.entry.properties?.name || fallbackName,
			matchedKind: match.kind,
			isNewFolder: false
		});
	}
	return suggestions;
}

function buildKnownFolderLookup(knownFolders: Iterable<string>): Map<string, string> {
	const map = new Map<string, string>();
	for (const raw of knownFolders) {
		const normalized = normalizePath(raw);
		if (!normalized) continue;
		map.set(normalized.toLowerCase(), normalized);
		const slugKey = normalized
			.split('/')
			.map((segment) => slugifyName(segment) || segment.toLowerCase())
			.join('/');
		if (!map.has(slugKey)) map.set(slugKey, normalized);
	}
	return map;
}

function resolveCandidateAgainstKnownFolders(
	segments: string[],
	knownLookup: Map<string, string>
): { path: string; exists: boolean } {
	let currentPath = '';
	let allMatched = true;
	for (const rawSegment of segments) {
		const slug = slugifyName(rawSegment);
		if (!slug) continue;
		const proposed = currentPath ? `${currentPath}/${slug}` : slug;
		const existing = knownLookup.get(proposed.toLowerCase());
		if (existing) {
			currentPath = existing;
		} else {
			currentPath = proposed;
			allMatched = false;
		}
	}
	return { path: normalizePath(currentPath), exists: Boolean(currentPath) && allMatched };
}

function extractGeocoderAdminHierarchy(features: readonly GeocoderFeature[]) {
	let countryCode: string | null = null;
	let countryName: string | null = null;
	let regionName: string | null = null;
	let subregionName: string | null = null;

	for (const feature of features) {
		const types = feature.place_type || [];
		const text = feature.text_en || feature.text || '';
		if (types.includes('country')) {
			if (!countryName && text) countryName = text;
			if (!countryCode)
				countryCode = feature.properties?.country_code || feature.properties?.short_code || null;
		} else if (types.includes('region')) {
			if (!regionName && text) regionName = text;
		} else if (types.includes('subregion')) {
			if (!subregionName && text) subregionName = text;
		}

		for (const ctx of feature.context || []) {
			const ctxId = String(ctx.id || '');
			const ctxText = ctx.text_en || ctx.text || '';
			if (ctxId.startsWith('country')) {
				if (!countryName && ctxText) countryName = ctxText;
				if (!countryCode) countryCode = ctx.country_code || ctx.short_code || null;
			} else if (ctxId.startsWith('region') && !regionName && ctxText) {
				regionName = ctxText;
			} else if (ctxId.startsWith('subregion') && !subregionName && ctxText) {
				subregionName = ctxText;
			}
		}
	}

	return { countryCode, countryName, regionName, subregionName };
}

/** Tier 3: MapTiler reverse-geocoding fallback matched against existing repository folders. */
export async function fetchGeocoderHierarchySuggestions({
	coordinates,
	entryKind,
	apiKey,
	knownFolders = [],
	excludePath = null,
	signal,
	fetchFn = fetch
}: {
	coordinates: [number, number] | null | undefined;
	entryKind?: string | null;
	apiKey?: string | null;
	knownFolders?: Iterable<string>;
	excludePath?: string | null;
	signal?: AbortSignal;
	fetchFn?: typeof fetch;
}): Promise<HierarchySuggestion[]> {
	if (!isValidCoordinate(coordinates) || !apiKey) return [];
	const kind = entryKind || 'crag';
	const [lng, lat] = coordinates;
	const params = new URLSearchParams({
		key: apiKey,
		types: 'country,region,subregion',
		language: 'en'
	});

	const response = await fetchFn(
		`https://api.maptiler.com/geocoding/${lng},${lat}.json?${params}`,
		{ signal }
	);
	if (!response.ok) return [];
	const data = (await response.json()) as GeocoderResponse;
	const features = Array.isArray(data?.features) ? data.features : [];
	if (features.length === 0) return [];

	const { countryCode, countryName, regionName, subregionName } =
		extractGeocoderAdminHierarchy(features);
	const continent = continentSlugForCountryCode(countryCode);
	if (!continent) return [];

	const knownLookup = buildKnownFolderLookup(knownFolders);
	const candidates: Array<{
		segments: string[];
		labels: string[];
		matchedKind: EntryKind;
		onlyIfExists?: boolean;
	}> = [];

	if (kind === 'country') {
		candidates.push({
			segments: [continent],
			labels: [continent],
			matchedKind: 'area'
		});
	} else if (kind === 'region') {
		if (countryName) {
			candidates.push({
				segments: [continent, countryName],
				labels: [countryName],
				matchedKind: 'country'
			});
		}
	} else {
		if (countryName && regionName && subregionName) {
			candidates.push({
				segments: [continent, countryName, regionName, subregionName],
				labels: [countryName, regionName, subregionName],
				matchedKind: 'area',
				// Only propose administrative subregions if that folder already exists in Felslager.
				onlyIfExists: true
			});
		}
		if (countryName && regionName) {
			candidates.push({
				segments: [continent, countryName, regionName],
				labels: [countryName, regionName],
				matchedKind: 'region'
			});
		}
		if (countryName) {
			candidates.push({
				segments: [continent, countryName],
				labels: [countryName],
				matchedKind: 'country'
			});
		}
	}

	const suggestions: HierarchySuggestion[] = [];
	const seen = new Set<string>();
	for (const candidate of candidates) {
		const resolved = resolveCandidateAgainstKnownFolders(candidate.segments, knownLookup);
		if (!resolved.path || seen.has(resolved.path) || isExcludedPath(resolved.path, excludePath))
			continue;
		if (candidate.onlyIfExists && !resolved.exists) continue;
		seen.add(resolved.path);
		suggestions.push({
			parentPath: resolved.path,
			source: 'geocoder',
			label: candidate.labels.join(' › '),
			matchedKind: candidate.matchedKind,
			isNewFolder: !resolved.exists
		});
	}

	// Prefer existing repository folders ahead of newly proposed folders.
	suggestions.sort((a, b) => Number(a.isNewFolder) - Number(b.isNewFolder));
	return suggestions;
}

/** Decide whether location-based suggestions may automatically relocate an entry. */
export function shouldAutoApplyHierarchySuggestion({
	isReview = false,
	hasSourcePath = false,
	hasManualSelection = false,
	currentParentPath = '',
	lastAutoAppliedParentPath = null
}: {
	isReview?: boolean;
	hasSourcePath?: boolean;
	hasManualSelection?: boolean;
	currentParentPath?: string | null;
	lastAutoAppliedParentPath?: string | null;
}): boolean {
	if (isReview || hasSourcePath || hasManualSelection) return false;
	const normalizedCurrent = normalizePath(currentParentPath || '');
	if (!normalizedCurrent) return true;
	const normalizedLastAuto = normalizePath(lastAutoAppliedParentPath || '');
	return Boolean(normalizedLastAuto) && normalizedCurrent === normalizedLastAuto;
}

/** Resolve location-based hierarchy suggestions using Tier 1 (manifest polygons) and Tier 3 (MapTiler reverse geocoding). */
export async function suggestHierarchyFromLocation({
	coordinates,
	entryKind = 'crag',
	manifestEntries = [],
	knownFolders = [],
	apiKey = '',
	excludePath = null,
	signal,
	fetchFn = fetch
}: {
	coordinates: [number, number] | null | undefined;
	entryKind?: string | null;
	manifestEntries?: readonly HierarchyManifestEntry[];
	knownFolders?: Iterable<string>;
	apiKey?: string | null;
	excludePath?: string | null;
	signal?: AbortSignal;
	fetchFn?: typeof fetch;
}): Promise<HierarchySuggestion[]> {
	const polygonMatches = findPolygonHierarchySuggestions({
		coordinates,
		entryKind,
		manifestEntries,
		excludePath
	});

	const sufficientKinds = SUFFICIENT_POLYGON_KINDS[entryKind || 'crag'] ?? ['area', 'region'];
	const hasSpecificPolygon = polygonMatches.some(
		(match) =>
			pathDepth(match.parentPath) > 1 &&
			match.matchedKind &&
			sufficientKinds.includes(match.matchedKind)
	);
	if (hasSpecificPolygon) return polygonMatches.slice(0, 3);

	let geocoderMatches: HierarchySuggestion[] = [];
	try {
		geocoderMatches = await fetchGeocoderHierarchySuggestions({
			coordinates,
			entryKind,
			apiKey,
			knownFolders,
			excludePath,
			signal,
			fetchFn
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error;
		geocoderMatches = [];
	}

	const merged: HierarchySuggestion[] = [];
	const seen = new Set<string>();
	// If Tier 1 only matched a coarse country polygon and Tier 3 found a deeper existing region,
	// put the deeper existing region first while keeping all unique matches.
	const combined =
		polygonMatches.length > 0 &&
		geocoderMatches.some(
			(item) =>
				!item.isNewFolder && pathDepth(item.parentPath) > pathDepth(polygonMatches[0].parentPath)
		)
			? [...geocoderMatches, ...polygonMatches]
			: [...polygonMatches, ...geocoderMatches];

	for (const item of combined) {
		if (seen.has(item.parentPath)) continue;
		seen.add(item.parentPath);
		merged.push(item);
		if (merged.length >= 3) break;
	}
	return merged;
}

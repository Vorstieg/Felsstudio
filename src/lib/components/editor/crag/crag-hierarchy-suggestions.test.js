import { describe, expect, it, vi } from 'vitest';
import {
	continentSlugForCountryCode,
	findPolygonHierarchySuggestions,
	shouldAutoApplyHierarchySuggestion,
	suggestHierarchyFromLocation
} from './crag-hierarchy-suggestions.ts';

function boxPolygon(minLng, minLat, maxLng, maxLat) {
	return {
		type: 'Polygon',
		coordinates: [
			[
				[minLng, minLat],
				[maxLng, minLat],
				[maxLng, maxLat],
				[minLng, maxLat],
				[minLng, minLat]
			]
		]
	};
}

const manifestEntries = [
	{
		entryPath: 'europe/austria',
		properties: { id: 'austria', name: 'Österreich', kind: 'country' },
		geometry: boxPolygon(9.5, 46.3, 17.2, 49.0)
	},
	{
		entryPath: 'europe/austria/salzburg',
		properties: { id: 'salzburg', name: 'Salzburg', kind: 'region' },
		geometry: boxPolygon(12.0, 47.0, 14.0, 48.0)
	},
	{
		entryPath: 'europe/austria/salzburg/dachstein-gebirge',
		properties: { id: 'dachstein-gebirge', name: 'Dachstein-Gebirge', kind: 'area' },
		geometry: boxPolygon(13.4, 47.4, 13.8, 47.6)
	},
	{
		entryPath: 'europe/austria/salzburg/dachstein-gebirge/bischofsmuetze',
		properties: { id: 'bischofsmuetze', name: 'Bischofsmütze', kind: 'crag' },
		geometry: boxPolygon(13.48, 47.48, 13.52, 47.52)
	}
];

describe('crag-hierarchy-suggestions', () => {
	it('maps ISO country codes to continent slugs', () => {
		expect(continentSlugForCountryCode('at')).toBe('europe');
		expect(continentSlugForCountryCode('US')).toBe('north-america');
		expect(continentSlugForCountryCode('jp')).toBe('asia');
		expect(continentSlugForCountryCode('xx')).toBeNull();
	});

	it('prefers the deepest valid polygon container for a crag (Tier 1)', () => {
		const suggestions = findPolygonHierarchySuggestions({
			coordinates: [13.5, 47.5],
			entryKind: 'crag',
			manifestEntries
		});
		expect(suggestions.map((item) => item.parentPath)).toEqual([
			'europe/austria/salzburg/dachstein-gebirge',
			'europe/austria/salzburg',
			'europe/austria'
		]);
		expect(suggestions[0]).toMatchObject({
			source: 'polygon',
			label: 'Dachstein-Gebirge',
			matchedKind: 'area',
			isNewFolder: false
		});
	});

	it('suggests the enclosing crag polygon when creating a sector', () => {
		const suggestions = findPolygonHierarchySuggestions({
			coordinates: [13.5, 47.5],
			entryKind: 'sector',
			manifestEntries
		});
		expect(suggestions[0].parentPath).toBe(
			'europe/austria/salzburg/dachstein-gebirge/bischofsmuetze'
		);
		expect(suggestions[0].matchedKind).toBe('crag');
	});

	it('skips geocoder network call when Tier 1 finds a specific area/region polygon', async () => {
		const fetchFn = vi.fn();
		const suggestions = await suggestHierarchyFromLocation({
			coordinates: [13.5, 47.5],
			entryKind: 'crag',
			manifestEntries,
			apiKey: 'test-key',
			fetchFn
		});
		expect(fetchFn).not.toHaveBeenCalled();
		expect(suggestions[0].parentPath).toBe('europe/austria/salzburg/dachstein-gebirge');
	});

	it('falls back to MapTiler reverse geocoding (Tier 3) and matches existing folders', async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				features: [
					{
						place_type: ['subregion'],
						text_en: 'Bezirk Mödling',
						context: [
							{ id: 'region.1', text_en: 'Lower Austria' },
							{ id: 'country.1', text_en: 'Austria', country_code: 'at' }
						]
					}
				]
			})
		});

		const suggestions = await suggestHierarchyFromLocation({
			coordinates: [16.085, 48.035],
			entryKind: 'crag',
			manifestEntries: [manifestEntries[0]], // only country polygon matches -> refine with Tier 3
			knownFolders: new Set(['europe', 'europe/austria', 'europe/austria/lower-austria']),
			apiKey: 'test-key',
			fetchFn
		});

		expect(fetchFn).toHaveBeenCalledOnce();
		// Subregion "bezirk-moedling" is ignored because it does not exist in knownFolders;
		// existing region folder "europe/austria/lower-austria" wins over coarse country polygon.
		expect(suggestions[0]).toMatchObject({
			parentPath: 'europe/austria/lower-austria',
			source: 'geocoder',
			label: 'Austria › Lower Austria',
			isNewFolder: false
		});
		expect(suggestions.map((s) => s.parentPath)).toEqual([
			'europe/austria/lower-austria',
			'europe/austria'
		]);
	});

	it('marks brand-new region folders from Tier 3 with isNewFolder: true', async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				features: [
					{
						place_type: ['region'],
						text_en: 'Tyrol',
						context: [{ id: 'country.1', text_en: 'Austria', country_code: 'at' }]
					}
				]
			})
		});

		const suggestions = await suggestHierarchyFromLocation({
			coordinates: [11.4, 47.26],
			entryKind: 'crag',
			manifestEntries: [],
			knownFolders: new Set(['europe', 'europe/austria']),
			apiKey: 'test-key',
			fetchFn
		});

		expect(suggestions[0]).toMatchObject({
			parentPath: 'europe/austria',
			isNewFolder: false
		});
		expect(suggestions[1]).toMatchObject({
			parentPath: 'europe/austria/tyrol',
			isNewFolder: true
		});
	});

	it('infers area kind for untyped manifest polygons (e.g., AVE areas without kind in manifest.json)', () => {
		const untypedManifest = [
			{
				entryPath: 'europe/austria/tyrol/kaiser-gebirge',
				properties: { id: 'kaiser-gebirge', name: 'Kaiser-Gebirge', type: [] },
				geometry: boxPolygon(12.2, 47.5, 12.45, 47.65)
			},
			{
				entryPath: 'europe/austria/tyrol/kaiser-gebirge/wilder-kaiser',
				properties: { id: 'wilder-kaiser', name: 'Wilder Kaiser', type: [] },
				geometry: boxPolygon(12.25, 47.53, 12.4, 47.6)
			}
		];
		const suggestions = findPolygonHierarchySuggestions({
			coordinates: [12.32, 47.56],
			entryKind: 'crag',
			manifestEntries: untypedManifest
		});
		expect(suggestions.map((s) => s.parentPath)).toEqual([
			'europe/austria/tyrol/kaiser-gebirge/wilder-kaiser',
			'europe/austria/tyrol/kaiser-gebirge'
		]);
	});

	it('never auto-applies in review drafts or over pre-existing parent paths', () => {
		// Reviewing a newly added entry like Chiemgauer Alpen must never relocate it.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: true,
				hasSourcePath: false,
				hasManualSelection: false,
				currentParentPath: 'europe/austria/tyrol'
			})
		).toBe(false);
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: true,
				hasSourcePath: false,
				hasManualSelection: false,
				currentParentPath: ''
			})
		).toBe(false);
		// Non-review entries that already have a parent path (e.g. reopened draft or child sector) stay put.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: false,
				hasSourcePath: false,
				hasManualSelection: false,
				currentParentPath: 'europe/austria/tyrol'
			})
		).toBe(false);
		// Saved repository entries never auto-move.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: false,
				hasSourcePath: true,
				hasManualSelection: false,
				currentParentPath: ''
			})
		).toBe(false);
	});

	it('auto-applies for brand-new unplaced entries and updates while still auto-placed', () => {
		// Brand-new crag with empty parentPath gets auto-placed.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: false,
				hasSourcePath: false,
				hasManualSelection: false,
				currentParentPath: ''
			})
		).toBe(true);
		// Moving the pin updates the path as long as it still matches the last auto-applied path.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: false,
				hasSourcePath: false,
				hasManualSelection: false,
				currentParentPath: 'europe/austria/vienna',
				lastAutoAppliedParentPath: 'europe/austria/vienna'
			})
		).toBe(true);
		// Once the user picks a folder manually, auto-apply stops.
		expect(
			shouldAutoApplyHierarchySuggestion({
				isReview: false,
				hasSourcePath: false,
				hasManualSelection: true,
				currentParentPath: 'europe/austria/vienna',
				lastAutoAppliedParentPath: 'europe/austria/vienna'
			})
		).toBe(false);
	});

	it('ranks a depth-1 continent polygon below country polygons and still refines with Tier 3', async () => {
		const europeAndFrance = [
			{
				entryPath: 'europe',
				properties: { id: 'europe', name: 'Europa', kind: 'region' },
				geometry: boxPolygon(-10, 35, 35, 70)
			},
			{
				entryPath: 'europe/france',
				properties: { id: 'france', name: 'Frankreich', kind: 'country' },
				geometry: boxPolygon(-5, 42, 9, 51)
			}
		];
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				features: [
					{
						place_type: ['region'],
						text_en: 'Auvergne-Rhône-Alpes',
						context: [{ id: 'country.1', text_en: 'France', country_code: 'fr' }]
					}
				]
			})
		});

		const cragSuggestions = await suggestHierarchyFromLocation({
			coordinates: [5.7, 45.2],
			entryKind: 'crag',
			manifestEntries: europeAndFrance,
			knownFolders: new Set(['europe', 'europe/france', 'europe/france/auvergne-rhone-alpes']),
			apiKey: 'test-key',
			fetchFn
		});
		expect(fetchFn).toHaveBeenCalledOnce();
		expect(cragSuggestions.map((s) => s.parentPath)).toEqual([
			'europe/france/auvergne-rhone-alpes',
			'europe/france',
			'europe'
		]);

		const countrySuggestions = findPolygonHierarchySuggestions({
			coordinates: [5.7, 45.2],
			entryKind: 'country',
			manifestEntries: europeAndFrance
		});
		expect(countrySuggestions.map((s) => s.parentPath)).toEqual(['europe']);
	});
});

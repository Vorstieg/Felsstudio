import { describe, expect, it } from 'vitest';
import emptyTopo from './fixtures/2d/empty-topo.json';
import legacyTopo from './fixtures/2d/legacy-topo.json';
import mixedTopo from './fixtures/2d/mixed-topo.json';

function assertTopoCollections(topo) {
	for (const key of ['routes', 'fixPoints', 'outlines']) {
		expect(topo[key], key).toBeInstanceOf(Array);
	}
}

describe('2D editor fixtures', () => {
	it('provides a valid empty document', () => {
		assertTopoCollections(emptyTopo);
		expect(emptyTopo.canvasAspectRatio).toBeGreaterThan(0);
		expect(emptyTopo.backgroundFit).toBe('contain');
		expect(emptyTopo.textLabels).toEqual([]);
	});

	it('provides every object family and nested path in the mixed fixture', () => {
		assertTopoCollections(mixedTopo);
		expect(mixedTopo.routes).toHaveLength(2);
		expect(mixedTopo.routes[1].pitches[0].points2D).toHaveLength(2);
		expect(mixedTopo.routes[1].variants[0].points2D).toHaveLength(2);
		expect(mixedTopo.outlines.some((outline) => outline.shape?.preset)).toBe(true);
		expect(mixedTopo.fixPoints).toHaveLength(2);
		expect(mixedTopo.textLabels[0].text).toContain('\n');
	});

	it('keeps a deliberately incomplete legacy document available for migration tests', () => {
		assertTopoCollections(legacyTopo);
		expect(legacyTopo.canvasAspectRatio).toBeUndefined();
		expect(legacyTopo.backgroundFit).toBeUndefined();
	});
});

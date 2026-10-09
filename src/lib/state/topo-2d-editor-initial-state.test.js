// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createInitialTopo } from './topo-2d-editor-initial-state.ts';

describe('createInitialTopo', () => {
	it('constructs fresh collections for an empty or partial document', () => {
		const first = createInitialTopo({});
		const second = createInitialTopo({ outlines: null });
		expect(first).toEqual({ routes: [], fixPoints: [], outlines: [], textLabels: [] });
		first.outlines.push({ id: 'outline-1' });
		expect(second.outlines).toEqual([]);
	});

	it('preserves supplied metadata and omitted optional fields', () => {
		const input = {
			routes: [{ id: 'route-1', points2D: [[0.2, 0.3]] }],
			coordinates: [16, 48],
			customMetadata: { source: 'guide' }
		};
		const document = createInitialTopo(input);
		expect(document).toMatchObject(input);
		expect(document).not.toHaveProperty('imageAspectRatio');
	});

	it('constructs the blank topo defaults with independent collections', () => {
		const first = createInitialTopo();
		const second = createInitialTopo();
		expect(first).toMatchObject({ imageAspectRatio: 1.5, coordinates: [0, 0, 0], routes: [] });
		first.routes.push({ id: 'route-1' });
		expect(second.routes).toEqual([]);
	});
});

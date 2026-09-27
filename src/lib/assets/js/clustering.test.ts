import { describe, expect, it } from 'vitest';
import { runClusteringPipeline } from './clustering.ts';
import type { ClusteringHit } from '$lib/state/clustering-types.ts';

const hit = (img: string, camX: number, overrides: Partial<ClusteringHit> = {}): ClusteringHit => ({
	pos: [0, 0, 0],
	cam_pos: [camX, 0, 0],
	conf: 0.8,
	class: 'bolt',
	img,
	crop: img,
	edge_dist: 0.1,
	normal_dot: 0.9,
	cam_dist: 1,
	...overrides
});

const params = {
	radius: 0.5,
	minConfidence: 0.5,
	maxEdgeDist: 0.5,
	minAngleCos: 0.5,
	maxCamDist: 10,
	minViewSpread: 1,
	minObservations: 2
};

describe('runClusteringPipeline', () => {
	it('filters hits and produces inspectable clusters with GPS data', () => {
		const hits = [
			hit('F1.jpg', 0),
			hit('F2.jpg', 2, { pos: [0.2, 0, 0] }),
			hit('F3.jpg', 3, { conf: 0.2 })
		];
		const result = runClusteringPipeline(hits, params, {
			1: { latitude: 47, longitude: 13, abs_alt: 1000 }
		});
		expect(result.stats).toMatchObject({
			totalHits: 3,
			confCut: 1,
			finalHits: 2,
			finalClusters: 1
		});
		expect(result.clusters[0]).toMatchObject({
			id: 'cluster-0',
			class: 'bolt',
			anchor: [0.1, 0, 0],
			spread_val: 2,
			conf: 80,
			members: [{ img: 'F1.jpg', gps: [47, 13, 1000] }, { img: 'F2.jpg' }]
		});
	});

	it('requires observations from distinct images', () => {
		const result = runClusteringPipeline([hit('F1.jpg', 0), hit('F1.jpg', 2)], params);
		expect(result.stats.initialClusters).toBe(2);
		expect(result.clusters).toEqual([]);
	});
});

import type { ClusteringHit, Point3, TopoCluster } from '$lib/state/clustering-types.ts';
import type {
	Topo2DEditorClustering,
	TopoGpsPosition
} from '$lib/state/topo-2d-editor-initial-state.ts';

type ClusteringParams = Pick<
	Topo2DEditorClustering,
	| 'radius'
	| 'minConfidence'
	| 'maxEdgeDist'
	| 'minAngleCos'
	| 'maxCamDist'
	| 'minViewSpread'
	| 'minObservations'
>;
type ClusteringStats = Topo2DEditorClustering['stats'];
type CandidateCluster = {
	anchor: Point3;
	class: string;
	members: ClusteringHit[];
	spread_val?: number;
};

export function dist(p1: Point3, p2: Point3): number {
	return Math.sqrt(
		Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2)
	);
}

export function getHSL(q: number): string {
	let h: number;
	if (q < 40) h = (q / 40) * 20;
	else if (q < 80) h = 20 + ((q - 40) / 40) * 70;
	else h = 90 + ((q - 80) / 20) * 10;
	return 'hsl(' + h * 1.2 + ', 100%, 50%)';
}

export function runClusteringPipeline(
	allHits: ClusteringHit[],
	params: ClusteringParams,
	gpsData: Record<string, TopoGpsPosition> | null = null
): { clusters: TopoCluster[]; stats: ClusteringStats } {
	const {
		radius,
		minConfidence,
		maxEdgeDist,
		minAngleCos,
		maxCamDist,
		minViewSpread,
		minObservations
	} = params;

	const stats: ClusteringStats = {
		totalHits: allHits.length,
		confCut: 0,
		edgeCut: 0,
		angleCut: 0,
		distCut: 0,
		finalHits: 0,
		initialClusters: 0,
		spreadCut: 0,
		obsCut: 0,
		finalClusters: 0
	};

	// 1. Hard Cutoffs
	const h1 = allHits.filter((h) => h.conf >= minConfidence);
	stats.confCut = stats.totalHits - h1.length;

	const h2 = h1.filter((h) => h.edge_dist <= maxEdgeDist);
	stats.edgeCut = h1.length - h2.length;

	const h3 = h2.filter((h) => h.normal_dot >= minAngleCos);
	stats.angleCut = h2.length - h3.length;

	const h4 = h3.filter((h) => dist(h.pos, h.cam_pos) <= maxCamDist);
	stats.distCut = h3.length - h4.length;
	stats.finalHits = h4.length;

	// Enrich hits with GPS if available
	if (gpsData) {
		h4.forEach((h) => {
			const imgName = h.img || '';
			// Try to find an integer key in the image name
			const match =
				imgName.match(/[fF](\d+)/) || imgName.match(/frame(\d+)/) || imgName.match(/(\d+)/);
			const fIdx = match ? parseInt(match[1]).toString() : null;

			if (fIdx && gpsData[fIdx]) {
				h.gps = [
					gpsData[fIdx].latitude,
					gpsData[fIdx].longitude,
					gpsData[fIdx].abs_alt || gpsData[fIdx].rel_alt || 0
				];
			}
		});
	}

	// 2. Spatial Clustering
	const tempClusters: CandidateCluster[] = [];
	h4.forEach((h) => {
		let found = false;
		for (const c of tempClusters) {
			if (dist(h.pos, c.anchor) < radius && c.class === h.class) {
				if (!c.members.some((m) => m.img === h.img)) {
					c.members.push(h);
					found = true;
					break;
				}
			}
		}
		if (!found) tempClusters.push({ anchor: h.pos, class: h.class, members: [h] });
	});
	stats.initialClusters = tempClusters.length;

	// 3. Cluster Filters
	const c1 = tempClusters.filter((c) => {
		let ms = 0;
		for (let i = 0; i < c.members.length; i++) {
			for (let j = i + 1; j < c.members.length; j++) {
				ms = Math.max(ms, dist(c.members[i].cam_pos, c.members[j].cam_pos));
			}
		}
		c.spread_val = ms;
		return ms >= minViewSpread;
	});
	stats.spreadCut = tempClusters.length - c1.length;

	const finalCandidates = c1.filter((c) => c.members.length >= minObservations);
	stats.obsCut = c1.length - finalCandidates.length;
	stats.finalClusters = finalCandidates.length;

	// 4. Finalize Cluster properties
	const finalClusters: TopoCluster[] = finalCandidates.map((c, idx) => {
		const hts = c.members;
		const conf = (hts.reduce((a, b) => a + b.conf, 0) / hts.length) * 100;
		return {
			id: `cluster-${idx}`,
			class: c.class,
			members: hts,
			spread_val: c.spread_val ?? 0,
			conf,
			avg_angle: hts.reduce((a, b) => a + b.normal_dot, 0) / hts.length,
			anchor: [
				hts.reduce((sum, hit) => sum + hit.pos[0], 0) / hts.length,
				hts.reduce((sum, hit) => sum + hit.pos[1], 0) / hts.length,
				hts.reduce((sum, hit) => sum + hit.pos[2], 0) / hts.length
			],
			color: getHSL(Math.min(100, conf + hts.length * 2))
		};
	});

	return { clusters: finalClusters, stats };
}

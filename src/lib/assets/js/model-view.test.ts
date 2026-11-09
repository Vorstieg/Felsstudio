import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { getInitialModelView, getModelMatrix, transformClusteringGeometry } from './model-view.ts';
import type { ClusteringHit, TopoCluster, Point3 } from '$lib/state/clustering-types.ts';
const transform = () => ({
	modelOffset: [0, 0, 0] as Point3,
	modelRotation: [0, 0, 0] as Point3,
	modelScale: [1, 1, 1] as Point3
});
const hit: ClusteringHit = {
	pos: [0, 0, 0],
	cam_pos: [0, 0, -10],
	conf: 0.9,
	class: 'bolt',
	img: 'photo.jpg',
	crop: 'crop.jpg',
	cam_dist: 10,
	normal_dot: 1,
	edge_dist: 0
};
const model = () => {
	const group = new Group();
	group.add(new Mesh(new BoxGeometry(2, 4, 1)));
	return group;
};
describe('model view', () => {
	it('opens on the photographed side', () => {
		const view = getInitialModelView(model(), transform(), {}, [hit])!;
		expect(view.position[2]).toBeLessThan(view.target[2]);
	});
	it('uses cameras even without bolt hits', () => {
		expect(
			getInitialModelView(model(), transform(), { photo: [0, 0, -10] }, [])!.position[2]
		).toBeLessThan(0);
	});
	it('keeps Z-up geometry, centering and the viewing direction aligned', () => {
		const pose = {
			...transform(),
			modelRotation: [-Math.PI / 2, 0, 0] as Point3,
			modelOffset: [2, 3, 4] as Point3
		};
		const matrix = getModelMatrix(pose);
		expect(new Vector3(0, 0, 10).applyMatrix4(matrix).y).toBeGreaterThan(
			new Vector3(0, 0, 0).applyMatrix4(matrix).y
		);
		const view = getInitialModelView(model(), pose, {}, [hit])!;
		expect(view.target).toEqual([2, 3, 4]);
		expect(view.position[1]).toBeLessThan(view.target[1]);
	});
	it('fits large models on portrait displays without clipping', () => {
		const geometry = model();
		geometry.scale.setScalar(1000);
		const landscape = getInitialModelView(geometry, transform(), {}, [], 2)!;
		const portrait = getInitialModelView(geometry, transform(), {}, [], 0.5)!;
		expect(portrait.position[2]).toBeGreaterThan(landscape.position[2]);
		expect(portrait.far).toBeGreaterThan(portrait.position[2]);
	});
	it('bakes all hits, anchors and camera positions exactly once with the model', () => {
		const pose = {
			...transform(),
			modelRotation: [-Math.PI / 2, 0, 0] as Point3,
			modelScale: [2, 2, 2] as Point3
		};
		const cluster: TopoCluster = {
			id: 'cluster',
			anchor: hit.pos,
			members: [hit],
			class: 'bolt',
			color: 'red',
			conf: 90,
			spread_val: 0,
			avg_angle: 1
		};
		const result = transformClusteringGeometry(
			{ rawHits: [hit], clusters: [cluster], cameraPositions: { photo: hit.cam_pos } },
			getModelMatrix(pose)
		);
		const expected = new Vector3(...hit.cam_pos).applyMatrix4(getModelMatrix(pose)).toArray();
		result.rawHits[0].cam_pos.forEach((value, i) => expect(value).toBeCloseTo(expected[i]));
		expect(result.rawHits[0].cam_dist).toBeCloseTo(20);
		expect(result.clusters[0].members[0]).toBe(result.rawHits[0]);
		expect(result.cameraPositions.photo).toEqual(result.rawHits[0].cam_pos);
		expect(hit.cam_pos).toEqual([0, 0, -10]);
	});
});

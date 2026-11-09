import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ClusteringHit, Point3, TopoCluster } from '$lib/state/clustering-types.ts';

type ModelTransform = { modelOffset: Point3; modelRotation: Point3; modelScale: Point3 };
export function getModelMatrix(transform: ModelTransform): Matrix4 {
	return new Matrix4().compose(
		new Vector3(...transform.modelOffset),
		new Quaternion().setFromEuler(new Euler(...transform.modelRotation)),
		new Vector3(...transform.modelScale)
	);
}

export function getInitialModelView(
	model: Object3D,
	transform: ModelTransform,
	cameras: Record<string, Point3>,
	hits: ClusteringHit[],
	aspect = 1
) {
	const matrix = getModelMatrix(transform);
	// Clone only the graph, retaining geometry references, to exclude the parent transform.
	const localBounds = new Box3().setFromObject(model.clone());
	if (localBounds.isEmpty()) return null;
	const bounds = localBounds.clone().applyMatrix4(matrix);
	const target = bounds.getCenter(new Vector3());
	const direction = new Vector3();
	for (const hit of hits) {
		const ray = new Vector3(...hit.cam_pos).sub(new Vector3(...hit.pos));
		if (ray.lengthSq() > 0) direction.add(ray.normalize());
	}
	if (direction.lengthSq() < 1e-8) {
		const positions = Object.values(cameras);
		for (const position of positions) direction.add(new Vector3(...position));
		if (positions.length)
			direction.divideScalar(positions.length).sub(localBounds.getCenter(new Vector3()));
	}
	if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
	direction.transformDirection(matrix);
	const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.1);
	const halfFov = (75 * Math.PI) / 360;
	const distance =
		(radius / Math.sin(Math.min(halfFov, Math.atan(Math.tan(halfFov) * Math.max(aspect, 0.1))))) *
		1.1;
	return {
		position: target.clone().addScaledVector(direction, distance).toArray() as Point3,
		target: target.toArray() as Point3,
		far: Math.max(1000, distance + radius * 3)
	};
}

export function transformClusteringGeometry(
	clustering: {
		rawHits: ClusteringHit[];
		clusters: TopoCluster[];
		cameraPositions: Record<string, Point3>;
	},
	matrix: Matrix4
) {
	const point = (position: Point3) =>
		new Vector3(...position).applyMatrix4(matrix).toArray() as Point3;
	const transformed = new Map<ClusteringHit, ClusteringHit>();
	const hit = (source: ClusteringHit) => {
		let result = transformed.get(source);
		if (!result) {
			const pos = point(source.pos);
			const cam_pos = point(source.cam_pos);
			result = {
				...source,
				pos,
				cam_pos,
				cam_dist: new Vector3(...pos).distanceTo(new Vector3(...cam_pos))
			};
			transformed.set(source, result);
		}
		return result;
	};
	return {
		rawHits: clustering.rawHits.map(hit),
		clusters: clustering.clusters.map((cluster) => ({
			...cluster,
			anchor: point(cluster.anchor),
			members: cluster.members.map(hit)
		})),
		cameraPositions: Object.fromEntries(
			Object.entries(clustering.cameraPositions).map(([key, position]) => [key, point(position)])
		)
	};
}

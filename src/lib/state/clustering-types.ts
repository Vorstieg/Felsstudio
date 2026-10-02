export type Point3 = [number, number, number];

export interface ClusteringHit {
	pos: Point3;
	cam_pos: Point3;
	conf: number;
	class: string;
	img: string;
	crop: string;
	edge_dist: number;
	normal_dot: number;
	cam_dist: number;
	gps?: Point3;
}

export interface TopoCluster {
	id: string;
	anchor: Point3;
	class: string;
	color: string;
	conf: number;
	members: ClusteringHit[];
	spread_val: number;
	avg_angle: number;
}

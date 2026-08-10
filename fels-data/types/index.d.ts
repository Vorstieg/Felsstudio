export type Position = [longitude: number, latitude: number, elevation?: number];
export type Point2D = [x: number, y: number];
export type Path2D = Point2D[];

export interface TopoPathFeature {
	type: 'Feature';
	id: string | number;
	properties?: Record<string, unknown>;
	geometry: { type: 'LineString'; coordinates: Position[] };
}

export interface TopoPathReference {
	pathId: string | number;
	role?: string;
	label?: string;
}

export interface TopoPathCollection {
	type: 'FeatureCollection';
	features: TopoPathFeature[];
}

export interface GeoJSONGeometry {
	type: 'Point' | 'Polygon' | 'MultiPolygon';
	coordinates: unknown;
}

export interface SectorSummary {
	id: string;
	name: string;
	[key: string]: unknown;
}

export interface CragProperties {
	id: string;
	name: string;
	path?: string;
	type?: string[];
	tags?: string[];
	security?: string;
	rock_type?: string;
	description_de?: string;
	description_en?: string;
	equipment?: unknown[];
	assets?: Record<string, unknown>;
	sectors: SectorSummary[];
	topo?: Record<string, unknown>;
	geometry?: GeoJSONGeometry;
	date?: string;
	updated?: string;
	[key: string]: unknown;
}

export interface CragFeature {
	type: 'Feature';
	properties: CragProperties;
	geometry: GeoJSONGeometry;
	[key: string]: unknown;
}

export interface SectorProperties {
	id: string;
	name: string;
	sort: number;
	type: string[];
	tags: string[];
	security?: string;
	rock_type?: string;
	/** Compass direction faced by the sector wall, in degrees from north. */
	wallAzimuth?: number;
	description_de?: string;
	description_en?: string;
	approach_de?: string;
	approach_en?: string;
	topo?: Record<string, unknown>;
	assets: Record<string, unknown>;
	path?: string;
	equipment?: unknown[];
	date?: string;
	updated?: string;
	[key: string]: unknown;
}

export interface SectorFeature {
	type: 'Feature';
	crag_id?: string;
	sector_id?: string;
	properties: SectorProperties;
	geometry: GeoJSONGeometry;
	[key: string]: unknown;
}

export interface Pitch {
	id: string | number;
	type: 'pitch';
	pitchNumber: number;
	grade?: string | number | null;
	lineStyle?: string;
	points2D: Path2D;
	[key: string]: unknown;
}

export interface Route {
	id: string | number;
	name?: string;
	type?: string;
	grade?: string | number | null;
	_gradeScale?: string;
	lineStyle?: string;
	description?: string;
	tags?: string[];
	points?: number[][];
	orientation?: number[];
	boltAmount?: number;
	length?: number;
	points2D?: Path2D;
	pitches?: Pitch[];
	variants?: Record<string, unknown>[];
	fixPoints?: (string | number)[];
	pathRefs?: TopoPathReference[];
	[key: string]: unknown;
}

export interface FixPoint {
	id: string | number;
	type: string;
	position2D?: Point2D;
	position?: number[];
	[key: string]: unknown;
}

export interface Outline {
	id: string | number;
	lineStyle?: 'rock' | 'approach' | 'descent' | 'variant' | 'fixedRope';
	points2D: Path2D;
	[key: string]: unknown;
}

export interface TextLabel {
	id: string | number;
	/** Newlines render as separate SVG rows. */
	text: string;
	/** Normalized anchor of the first row. */
	position2D: Point2D;
	/** Logical SVG pixels. Defaults to 24. */
	fontSize2D?: number;
	/** CSS color. Defaults to #111827. */
	color?: string;
	/** CSS font weight. The editor writes 400, 600, or 700. */
	fontWeight?: string | number;
	/** Horizontal alignment relative to position2D. Defaults to center. */
	textAlign2D?: 'left' | 'center' | 'right';
	[key: string]: unknown;
}

export interface TopoDocument {
	id?: string;
	description?: string;
	rock?: string;
	tags?: string[];
	date?: string;
	updated?: string;
	author?: string;
	coordinates?: [longitude: number, latitude: number, elevation?: number];
	altitude?: number;
	routes: Route[];
	paths?: TopoPathCollection;
	fixPoints?: FixPoint[];
	outlines?: Outline[];
	textLabels?: TextLabel[];
	[key: string]: unknown;
}

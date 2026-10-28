export type FlightWaypoint = {
	index: number;
	longitude: number;
	latitude: number;
	altitude: number;
	phase: 'capture' | 'transit';
	speed: number;
	heading: number;
	gimbalPitch: number;
	camera: string;
	detailCamera?: string;
	captureTarget?: { longitude: number; latitude: number; altitude: number };
	captureView?: 'face' | 'crest';
	captureKind?: 'grid' | 'supplementary';
	rowBoundary: 'start' | 'end' | 'single' | null;
	id?: string | number;
};

export type FlightPlanMetadata = {
	pattern: string;
	strategy: 'single-grid-with-targeted-views';
	targetGsdCm: number;
	standOffMeters: number;
	terrainSource: string;
	captureHeightMeters: number;
	sectorMinimumElevation: number;
	sectorMaximumElevation: number;
	stripSpacingMeters: number;
	minimumFaceDistanceMeters: number;
	minimumGroundClearanceMeters: number;
	captureAltitudeToleranceMeters: number;
	lowestCaptureAltitude: number;
	captureAltitudeCeiling: number;
	altitudeCappedWaypointCount: number;
	unresolvedWallSurfaceCount: number;
	fragmentedRowCount: number;
	discardedFragmentWaypointCount: number;
	terrainMeshSpacingMeters: number;
	coveragePasses: number;
	obliqueOffsetMeters: number;
	droppedWaypointCount: number;
	/** Actual launch elevation in metres AMSL, in the terrain elevation datum. */
	startElevation?: number;
	speed?: number;
	transitSpeed?: number;
	camera?: string;
	photoCount?: number;
	detailPhotoCount?: number;
	supplementaryWaypointCount?: number;
	gridWaypointCount?: number;
	captureOverlap?: number;
	coverageStatus?: 'modeled' | 'partial' | 'unresolved';
	coverageTargetCount?: number;
	coveredTargetCount?: number;
	uncoveredTargetCount?: number;
	crestTargetCount?: number;
	coveredCrestTargetCount?: number;
	spacingGapCount?: number;
	[key: string]: unknown;
};

export type FlightPlan = {
	name: string;
	cragName: string;
	metadata: FlightPlanMetadata;
	wallDetection: {
		confidence: number;
		averageSlope: number;
		shape: string;
		deviationMeters: number;
		coordinates: number[][];
		topCoordinates: number[][];
		samples: Array<{ coordinates: number[]; slope: number }>;
		[key: string]: unknown;
	};
	waypoints: FlightWaypoint[];
	previewWaypointIndex?: number | null;
};

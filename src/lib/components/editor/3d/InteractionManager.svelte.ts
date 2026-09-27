import { Matrix3, Vector3, Raycaster } from 'three';
import type { Camera, Group, Object3D } from 'three';
import { generateRouteId, generateSymbolId, generateId } from '$lib/assets/js/id-utils.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type Id = string | number;
type Point3 = [number, number, number];
type PointData = { point: Vector3; normal: Vector3 };
type ClickData = PointData & { mesh: Object3D | null };
type LineSegment = { id: number; points: Vector3[]; pointsData: PointData[] };
type VisualRoute = { parentId: Id; rawPoints: Vector3[]; normal?: Vector3 | null };
type VisualFixPoint = { id: Id; rawPosition: Point3 };
type VisualCluster = { id: Id; anchor: Point3 };
type SnappedVertex = {
	point: Vector3;
	id?: Id;
	type?: 'fixpoint' | 'cluster';
	routeId?: Id;
	index?: number;
};
type MeshHitEvent = {
	object?: Object3D;
	point?: Vector3;
	face?: { normal: Vector3 } | null;
	camera?: Camera;
};
type RouteHitEvent = { point: Vector3; camera?: Camera; stopPropagation(): void };
type FixPointHitEvent = { camera?: Camera; stopPropagation(): void };
function point3(value: unknown): Point3 | null {
	return Array.isArray(value) &&
		value.length >= 3 &&
		value.slice(0, 3).every((n) => typeof n === 'number')
		? [value[0], value[1], value[2]]
		: null;
}

export class Topo3DInteractionManager {
	// State
	currentClickData = $state<ClickData[]>([]);
	currentLineSegments = $state<LineSegment[]>([]);
	firstPointVisual = $state<Point3 | null>(null);
	previewLineSegment = $state<{ points: Vector3[] } | null>(null);
	lastPreviewUpdate = 0;

	localDrawingState = $state<{ routeId: Id; pitchId: Id } | null>(null);
	lastSnappedRouteId = $state<Id | null>(null);
	lastSnappedVertexIndex = $state(-1);
	hoverSnappedRouteId = $state<Id | null>(null);
	updateTick = $state(0);

	// Dependencies settable via setter
	gltfScene = $state<Group | null>(null);
	modelPosition = $state<Point3>([0, 0, 0]); // Props.position

	// External Data needed for snapping
	visualRoutes = $state<VisualRoute[]>([]);
	visualFixPoints = $state<VisualFixPoint[]>([]);
	visualClusters = $state<VisualCluster[]>([]);

	projectionRaycaster = new Raycaster();
	STEP_SIZE = 0.2;
	OFFSET_DISTANCE = 0.05;
	SNAP_THRESHOLD = 0.15;

	constructor(readonly state: Editor) {}

	getSnappedVertex(point: Vector3): SnappedVertex {
		const finalPoint = point.clone();
		let bestDist = this.SNAP_THRESHOLD;
		let found: SnappedVertex | null = null;

		// Snap to real fixpoints
		this.visualFixPoints.forEach((fp) => {
			const fpPos = new Vector3(...fp.rawPosition);
			const dist = point.distanceTo(fpPos);
			if (dist < bestDist) {
				bestDist = dist;
				finalPoint.copy(fpPos);
				found = { point: finalPoint.clone(), type: 'fixpoint', id: fp.id };
			}
		});

		// Snap to detected clusters (3D-Create)
		this.visualClusters.forEach((c) => {
			const cPos = new Vector3(...c.anchor);
			const dist = point.distanceTo(cPos);
			if (dist < bestDist) {
				bestDist = dist;
				finalPoint.copy(cPos);
				found = { point: finalPoint.clone(), type: 'cluster', id: c.id };
			}
		});

		// Snap to route vertices
		this.visualRoutes.forEach((vr) => {
			vr.rawPoints.forEach((p, idx) => {
				const dist = point.distanceTo(p);
				if (dist < bestDist) {
					bestDist = dist;
					finalPoint.copy(p);
					found = { point: finalPoint.clone(), routeId: vr.parentId, index: idx };
				}
			});
		});

		return found || { point: point.clone() };
	}

	handleMeshPointerMove(event: Pick<MeshHitEvent, 'point'>, activeTool: string | null) {
		if (
			(activeTool !== 'route' && activeTool !== 'multipitch') ||
			this.currentClickData.length === 0
		) {
			if (this.previewLineSegment) this.previewLineSegment = null;
			this.hoverSnappedRouteId = null;
			return;
		}
		const now = Date.now();
		if (now - this.lastPreviewUpdate < 30) return;
		this.lastPreviewUpdate = now;
		if (!event.point) return;

		// Snap the preview point for visual feedback
		const snapResult = this.getSnappedVertex(event.point);
		this.hoverSnappedRouteId = snapResult.routeId || null;

		const startClick = this.currentClickData[this.currentClickData.length - 1];
		this.previewLineSegment = { points: [startClick.point.clone(), snapResult.point] };
	}

	handleMeshClick() {
		if (this.currentClickData.length === 0) {
			// Deselect logic
			this.state.ui.selectedRouteId = null;
			this.state.ui.selectedFixpointId = null;
		}
	}

	handleMeshDblClick(event: MeshHitEvent, activeTool: string | null) {
		let isMeshInLoadedScene = false;
		if (this.gltfScene && event.object) {
			if (event.object === this.gltfScene) {
				isMeshInLoadedScene = true;
			} else {
				event.object.traverseAncestors((ancestor) => {
					if (ancestor === this.gltfScene) isMeshInLoadedScene = true;
				});
			}
		}

		if (
			!isMeshInLoadedScene ||
			!this.gltfScene ||
			!event.object ||
			!event.point ||
			!event.face?.normal
		)
			return;

		if (activeTool === 'fixpoint') {
			const localPoint = this.gltfScene.worldToLocal(event.point.clone());
			const symbolType = this.state.ui.selectedSymbol || 'bolt';
			this.state.topo.fixPoints.push({
				id: generateSymbolId(),
				position3D: localPoint.toArray().map((c) => Number(c.toFixed(4))) as Point3,
				type: symbolType
			});
			return;
		}

		if (activeTool !== 'route' && activeTool !== 'multipitch') return;

		// Snapping to vertices only when clicking mesh
		const snapResult = this.getSnappedVertex(event.point);
		if (snapResult.routeId) {
			this.lastSnappedRouteId = snapResult.routeId;
			this.lastSnappedVertexIndex = snapResult.index ?? -1;
		} else {
			this.lastSnappedRouteId = null;
			this.lastSnappedVertexIndex = -1;
		}

		const normalMatrix = new Matrix3().getNormalMatrix(event.object.matrixWorld);
		const worldNormal = event.face.normal.clone().applyMatrix3(normalMatrix).normalize();
		const currentClick = { point: snapResult.point, normal: worldNormal, mesh: event.object };
		this.currentClickData = [...this.currentClickData, currentClick];

		if (this.currentClickData.length === 1) {
			this.firstPointVisual = currentClick.point
				.clone()
				.addScaledVector(currentClick.normal, 0.05)
				.toArray();
		}

		if (this.currentClickData.length >= 2) {
			const previousClick = this.currentClickData[this.currentClickData.length - 2];
			const segmentPointData = this.generateProjectedSegment(
				previousClick,
				currentClick,
				this.gltfScene,
				event.camera
			);

			if (segmentPointData && segmentPointData.length > 1) {
				const offsetPoints = segmentPointData.map((pd) =>
					new Vector3().copy(pd.point).addScaledVector(pd.normal, this.OFFSET_DISTANCE)
				);
				this.currentLineSegments = [
					...this.currentLineSegments,
					{
						id: this.currentLineSegments.length,
						points: offsetPoints,
						pointsData: segmentPointData
					}
				];
				this.previewLineSegment = null;
			}
		}
	}

	handleRouteDblClick(e: RouteHitEvent, parentId: Id, activeTool: string | null) {
		if (activeTool !== 'route' && activeTool !== 'multipitch') return;
		e.stopPropagation();

		const route = this.visualRoutes.find((vr) => vr.parentId === parentId);
		if (!route || !route.rawPoints || route.rawPoints.length === 0) return;

		let closestIdx = 0;
		let minDist = Infinity;
		route.rawPoints.forEach((p, idx) => {
			const d = p.distanceToSquared(e.point);
			if (d < minDist) {
				minDist = d;
				closestIdx = idx;
			}
		});

		const snappedPoint = route.rawPoints[closestIdx];
		const normal = route.normal || new Vector3(0, 1, 0);

		if (
			this.currentClickData.length > 0 &&
			this.lastSnappedRouteId === parentId &&
			this.lastSnappedVertexIndex !== -1
		) {
			const start = this.lastSnappedVertexIndex;
			const end = closestIdx;
			if (start !== end) {
				const step = start < end ? 1 : -1;
				const tracePoints: Vector3[] = [];
				const traceData: PointData[] = [];
				for (let k = start + step; ; k += step) {
					const p = route.rawPoints[k];
					tracePoints.push(p.clone());
					traceData.push({ point: p.clone(), normal: normal.clone() });
					if (k === end) break;
				}

				this.currentLineSegments = [
					...this.currentLineSegments,
					{ id: this.currentLineSegments.length, points: tracePoints, pointsData: traceData }
				];
				const last = traceData[traceData.length - 1];
				this.currentClickData = [
					...this.currentClickData,
					{ point: last.point, normal: last.normal, mesh: null }
				];
			}
		} else {
			const currentClick = { point: snappedPoint, normal: normal, mesh: null };
			this.currentClickData = [...this.currentClickData, currentClick];
			if (this.currentClickData.length === 1) {
				this.firstPointVisual = currentClick.point
					.clone()
					.addScaledVector(currentClick.normal, 0.05)
					.toArray();
			}
			if (this.currentClickData.length >= 2) {
				const previousClick = this.currentClickData[this.currentClickData.length - 2];
				const segmentPointData = this.generateProjectedSegment(
					previousClick,
					currentClick,
					this.gltfScene,
					e.camera
				);

				if (segmentPointData && segmentPointData.length > 1) {
					this.currentLineSegments = [
						...this.currentLineSegments,
						{
							id: this.currentLineSegments.length,
							points: segmentPointData.map((pd) => pd.point),
							pointsData: segmentPointData
						}
					];
				}
			}
		}

		this.lastSnappedRouteId = parentId;
		this.lastSnappedVertexIndex = closestIdx;
		this.previewLineSegment = null;
		this.updateTick += 1;
	}

	handleFixPointClick(e: { stopPropagation(): void }, pointId: Id) {
		e.stopPropagation();
		if (this.state.ui.selectedRouteId) {
			const route = this.state.topo.routes.find((r) => r.id === this.state.ui.selectedRouteId);
			if (route) {
				if (!route.fixPoints) route.fixPoints = [];
				if (route.fixPoints.includes(pointId)) {
					route.fixPoints = route.fixPoints.filter((id) => id !== pointId);
				} else {
					route.fixPoints.push(pointId);
				}
			}
		} else {
			this.state.ui.selectedFixpointId =
				this.state.ui.selectedFixpointId === pointId ? null : pointId;
		}
	}

	handleFixPointDblClick(e: FixPointHitEvent, pointId: Id, activeTool: string | null) {
		e.stopPropagation();

		if (
			(activeTool === 'multipitch' || activeTool === 'route') &&
			this.currentClickData.length > 0
		) {
			// Finish route/pitch logic
			const startPoint = this.state.topo.fixPoints.find((p) => p.id === pointId);
			if (!startPoint) return;

			const position = point3(startPoint.position3D);
			const scene = this.gltfScene;
			if (!position || !scene) return;
			const modelOffset = new Vector3(...this.modelPosition);
			const snapPoint = new Vector3(...position).add(modelOffset);
			const lastClick = this.currentClickData[this.currentClickData.length - 1];
			const snapClick = { point: snapPoint, normal: new Vector3(0, 1, 0), mesh: null };
			const segmentPoints = this.generateProjectedSegment(lastClick, snapClick, scene, e.camera);

			const allPointsWithNormals: PointData[] = [];
			this.currentLineSegments.forEach((segment) => {
				if (segment.pointsData?.length > 0) allPointsWithNormals.push(...segment.pointsData);
			});
			if (segmentPoints && segmentPoints.length > 0) {
				allPointsWithNormals.push(...segmentPoints);
			} else {
				allPointsWithNormals.push({ point: snapPoint, normal: new Vector3(0, 1, 0) });
			}

			const finalPoints = allPointsWithNormals.map((p) => {
				const localPoint = scene.worldToLocal(p.point.clone());
				return localPoint.toArray().map((c) => Number(c.toFixed(4)));
			});

			if (activeTool === 'multipitch') {
				const route = this.state.topo.routes.find(
					(r) => r.id === (this.localDrawingState?.routeId || this.state.ui.selectedRouteId)
				);
				if (route) {
					const pitches = route.pitches || [];
					let pitch = this.localDrawingState
						? pitches.find((p) => p.id === this.localDrawingState?.pitchId)
						: null;
					if (!pitch && pitches.length > 0) pitch = pitches[pitches.length - 1];
					if (pitch) {
						pitch.points3D = finalPoints as Point3[];
						pitch.endNodeId = pointId;
					}
				}
				this.localDrawingState = null;
			} else if (activeTool === 'route') {
				const averageNormal = new Vector3();
				allPointsWithNormals.forEach((pd) => averageNormal.add(pd.normal));
				averageNormal.normalize();
				const newRoute = {
					id: generateRouteId(),
					name: 'New Route',
					points3D: finalPoints as Point3[],
					orientation3D: [averageNormal.x, averageNormal.y, averageNormal.z] as Point3,
					tags: [],
					fixPoints: []
				};
				this.state.topo.routes = [...this.state.topo.routes, newRoute];
				this.state.ui.selectedRouteId = newRoute.id;
			}

			this.resetDrawingState();
			return;
		}

		if (activeTool === 'multipitch') {
			// START multipitch
			const route = this.state.topo.routes.find((r) => r.id === this.state.ui.selectedRouteId);
			if (route && route.type === 'multi-pitch') {
				const startPoint = this.state.topo.fixPoints.find((p) => p.id === pointId);
				if (startPoint) {
					const position = point3(startPoint.position3D);
					if (!position) return;
					const startClick = {
						point: new Vector3(...position).add(new Vector3(...this.modelPosition)),
						normal: new Vector3(0, 1, 0),
						mesh: null
					};
					this.currentClickData = [startClick];
					this.currentLineSegments = [];
					this.firstPointVisual = startClick.point.toArray();
					this.previewLineSegment = null;
					const newPitch = {
						id: generateId('pitch'),
						pitchNumber: (route.pitches?.length || 0) + 1,
						startNodeId: pointId,
						points3D: [],
						type: 'climb'
					};
					route.pitches = [...(route.pitches || []), newPitch];
					this.localDrawingState = { routeId: route.id, pitchId: newPitch.id };
					this.updateTick += 1;
				}
			}
		}
	}

	handleKeyDown(event: KeyboardEvent, activeTool: string | null) {
		// Global key handlers (Delete)
		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (this.state.ui.selectedFixpointId) {
				const idToDelete = this.state.ui.selectedFixpointId;
				// Remove from global fixpoints
				this.state.topo.fixPoints = this.state.topo.fixPoints.filter((p) => p.id !== idToDelete);

				// Remove references from routes
				this.state.topo.routes.forEach((route) => {
					if (route.fixPoints) {
						route.fixPoints = route.fixPoints.filter((id) => id !== idToDelete);
					}
					if (route.pitches) {
						route.pitches.forEach((pitch) => {
							if (pitch.startNodeId === idToDelete) pitch.startNodeId = null;
							if (pitch.endNodeId === idToDelete) pitch.endNodeId = null;
						});
					}
				});

				this.state.ui.selectedFixpointId = null;
				return;
			}
		}

		// Tool-specific handlers
		if (activeTool !== 'route' && activeTool !== 'multipitch') return;

		if (activeTool === 'multipitch' && (event.key === 'b' || event.key === 'B')) {
			if (this.currentClickData.length > 0) {
				// Multipitch BELAY logic (create anchor)
				this.finalizeMultipitchAnchor();
			}
			return;
		}

		if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') {
			this.finalizeRouteOrPitch(activeTool);
		} else if (event.key === 'Escape') {
			this.resetDrawingState();
		}
	}

	finalizeMultipitchAnchor() {
		const scene = this.gltfScene;
		if (!scene) return;
		const allPointsWithNormals: PointData[] = [];
		this.currentLineSegments.forEach((segment) => {
			if (segment.pointsData?.length > 0) allPointsWithNormals.push(...segment.pointsData);
		});
		if (allPointsWithNormals.length === 0) return;

		const finalPoints = allPointsWithNormals.map((p) => {
			const localPoint = scene.worldToLocal(p.point.clone());
			return localPoint.toArray().map((c) => Number(c.toFixed(4)));
		});

		let route = this.state.topo.routes.find(
			(r) => r.id === (this.localDrawingState?.routeId || this.state.ui.selectedRouteId)
		);
		if (!route) {
			route = { id: generateRouteId(), type: 'multi-pitch', pitches: [], tags: [], fixPoints: [] };
			this.state.topo.routes.push(route);
		}
		const pitches = (route.pitches ||= []);

		const anchorId = generateId('anchor');
		const lastPoint = allPointsWithNormals[allPointsWithNormals.length - 1];
		const localAnchor = scene.worldToLocal(lastPoint.point.clone());

		this.state.topo.fixPoints.push({
			id: anchorId,
			position3D: localAnchor.toArray().map((c) => Number(c.toFixed(4))) as Point3,
			type: 'belay'
		});

		const currentPitch = {
			id: generateId('pitch'),
			pitchNumber: pitches.length + 1,
			points3D: finalPoints as Point3[],
			type: 'pitch',
			endNodeId: anchorId
		};
		pitches.push(currentPitch);

		const nextPitch = {
			id: generateId('pitch'),
			pitchNumber: pitches.length + 1,
			startNodeId: anchorId,
			points3D: [],
			type: 'climb'
		};
		pitches.push(nextPitch);

		this.currentClickData = [
			{ point: lastPoint.point.clone(), normal: lastPoint.normal.clone(), mesh: null }
		];
		this.currentLineSegments = [];
		this.firstPointVisual = lastPoint.point.toArray();
		this.previewLineSegment = null;
		this.localDrawingState = { routeId: route.id, pitchId: nextPitch.id };
		this.lastSnappedRouteId = null;
		this.lastSnappedVertexIndex = -1;
		this.updateTick += 1;
	}

	finalizeRouteOrPitch(activeTool: string | null) {
		const scene = this.gltfScene;
		if (!scene) return;
		if (this.currentLineSegments.length > 0 && this.currentClickData.length > 0) {
			const allPointsWithNormals: PointData[] = [];
			this.currentLineSegments.forEach((segment) => {
				if (segment.pointsData?.length > 0) allPointsWithNormals.push(...segment.pointsData);
			});
			if (allPointsWithNormals.length > 0) {
				const finalPoints = allPointsWithNormals.map((p) => {
					const localPoint = scene.worldToLocal(p.point.clone());
					return localPoint.toArray().map((c) => Number(c.toFixed(4)));
				});
				const averageNormal = new Vector3();
				allPointsWithNormals.forEach((pd) => averageNormal.add(pd.normal));
				averageNormal.normalize();

				if (activeTool === 'multipitch') {
					let route = this.state.topo.routes.find(
						(r) => r.id === (this.localDrawingState?.routeId || this.state.ui.selectedRouteId)
					);
					if (!route) {
						route = {
							id: generateRouteId(),
							name: 'New Multi-Pitch',
							type: 'multi-pitch',
							pitches: [],
							orientation3D: [averageNormal.x, averageNormal.y, averageNormal.z] as Point3,
							tags: [],
							fixPoints: []
						};
						this.state.topo.routes = [...this.state.topo.routes, route];
						this.state.ui.selectedRouteId = route.id;
					}
					const pitches = (route.pitches ||= []);
					const endId = generateId('anchor');
					this.state.topo.fixPoints.push({
						id: endId,
						position3D: finalPoints[finalPoints.length - 1] as Point3,
						type: 'bolt'
					});
					pitches.push({
						id: generateId('pitch'),
						pitchNumber: pitches.length + 1,
						points3D: finalPoints as Point3[],
						type: 'climb',
						endNodeId: endId
					});
				} else {
					const newRoute = {
						id: generateRouteId(),
						name: 'New Route',
						points3D: finalPoints as Point3[],
						orientation3D: [averageNormal.x, averageNormal.y, averageNormal.z] as Point3,
						tags: [],
						fixPoints: []
					};
					this.state.topo.routes = [...this.state.topo.routes, newRoute];
					this.state.ui.selectedRouteId = newRoute.id;
				}
			}
			this.resetDrawingState();
		}
	}

	resetDrawingState() {
		this.currentClickData = [];
		this.currentLineSegments = [];
		this.firstPointVisual = null;
		this.previewLineSegment = null;
		this.lastSnappedRouteId = null;
		this.lastSnappedVertexIndex = -1;
		this.localDrawingState = null;
		this.updateTick += 1;
	}

	generateProjectedSegment(
		startData: PointData | null,
		endData: PointData | null,
		mesh: Object3D | null,
		cam: Camera | null | undefined,
		stepSize = this.STEP_SIZE
	): PointData[] {
		if (!cam || !mesh || !startData?.point || !endData?.point) return [];
		const startPoint = startData.point.clone();
		const endPoint = endData.point.clone();
		const startToEnd = new Vector3().subVectors(endPoint, startPoint);
		const segmentLength = startToEnd.length();
		if (segmentLength < 0.001)
			return [
				{ point: startPoint, normal: startData.normal.clone() },
				{ point: endPoint, normal: endData.normal.clone() }
			];

		const pointsData = [{ point: startPoint, normal: startData.normal.clone() }];
		const camPos = cam.position.clone();
		const subdivisions = Math.min(20, Math.max(5, Math.ceil(segmentLength / stepSize)));

		for (let i = 1; i < subdivisions; i++) {
			const t = i / subdivisions;
			const interP = new Vector3().copy(startPoint).addScaledVector(startToEnd, t);
			this.projectionRaycaster.set(camPos, new Vector3().subVectors(interP, camPos).normalize());
			const intersects = this.projectionRaycaster.intersectObject(mesh, true);

			const hit = intersects[0];
			if (hit?.face) {
				const normMat = new Matrix3().getNormalMatrix(hit.object.matrixWorld);
				pointsData.push({
					point: hit.point.clone(),
					normal: hit.face.normal.clone().applyMatrix3(normMat).normalize()
				});
			} else {
				pointsData.push({
					point: interP,
					normal: new Vector3().lerpVectors(startData.normal, endData.normal, t).normalize()
				});
			}
		}
		pointsData.push({ point: endPoint, normal: endData.normal.clone() });
		return pointsData;
	}
}

import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { Topo3DInteractionManager } from './InteractionManager.svelte.ts';

const createState = () => ({
	topo: { routes: [], fixPoints: [] },
	ui: { selectedRouteId: null, selectedFixpointId: null }
});

describe('Topo3DInteractionManager', () => {
	it('toggles a fixpoint on the selected route and selects it when no route is selected', () => {
		const state = createState();
		state.topo.routes.push({ id: 'r1', fixPoints: ['f1'] });
		const manager = new Topo3DInteractionManager(state);
		const event = { stopPropagation() {} };

		state.ui.selectedRouteId = 'r1';
		manager.handleFixPointClick(event, 'f1');
		expect(state.topo.routes[0].fixPoints).toEqual([]);
		manager.handleFixPointClick(event, 'f2');
		expect(state.topo.routes[0].fixPoints).toEqual(['f2']);

		state.ui.selectedRouteId = null;
		manager.handleFixPointClick(event, 'f1');
		expect(state.ui.selectedFixpointId).toBe('f1');
		manager.handleFixPointClick(event, 'f1');
		expect(state.ui.selectedFixpointId).toBeNull();
	});

	it('deletes the selected fixpoint and clears route and pitch references', () => {
		const state = createState();
		state.topo.fixPoints.push({ id: 'f1' }, { id: 'f2' });
		state.topo.routes.push({
			id: 'r1',
			fixPoints: ['f1', 'f2'],
			pitches: [{ startNodeId: 'f1', endNodeId: 'f1' }]
		});
		state.ui.selectedFixpointId = 'f1';
		const manager = new Topo3DInteractionManager(state);

		manager.handleKeyDown({ key: 'Delete' }, 'select');

		expect(state.topo.fixPoints).toEqual([{ id: 'f2' }]);
		expect(state.topo.routes[0].fixPoints).toEqual(['f2']);
		expect(state.topo.routes[0].pitches[0]).toMatchObject({ startNodeId: null, endNodeId: null });
		expect(state.ui.selectedFixpointId).toBeNull();
	});

	it('traces the route between snapped vertices when drawing starts on that route', () => {
		const state = createState();
		const routePoints = [new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(2, 0, 0)];
		const manager = new Topo3DInteractionManager(state);
		manager.visualRoutes = [
			{ parentId: 'r1', rawPoints: routePoints, normal: new Vector3(0, 1, 0) }
		];
		manager.currentClickData = [
			{ point: routePoints[0], normal: new Vector3(0, 1, 0), mesh: null }
		];
		manager.lastSnappedRouteId = 'r1';
		manager.lastSnappedVertexIndex = 0;
		const event = { point: new Vector3(2, 0, 0), camera: null, stopPropagation() {} };

		manager.handleRouteDblClick(event, 'r1', 'route');

		expect(manager.currentLineSegments).toHaveLength(1);
		expect(manager.currentLineSegments[0].points.map((point) => point.toArray())).toEqual([
			[1, 0, 0],
			[2, 0, 0]
		]);
		expect(manager.currentClickData.at(-1).point.toArray()).toEqual([2, 0, 0]);
		expect(manager.lastSnappedVertexIndex).toBe(2);
	});

	it('clears current selections on an empty mesh click', () => {
		const state = createState();
		state.ui.selectedRouteId = 'r1';
		state.ui.selectedFixpointId = 'f1';
		const manager = new Topo3DInteractionManager(state);

		manager.handleMeshClick();

		expect(state.ui.selectedRouteId).toBeNull();
		expect(state.ui.selectedFixpointId).toBeNull();
	});

	it('writes 3D fixpoints and route geometry using the Fels field names', () => {
		const state = createState();
		const manager = new Topo3DInteractionManager(state);
		const scene = new Group();
		manager.gltfScene = scene;
		manager.handleMeshDblClick(
			{
				object: scene,
				point: new Vector3(1, 2, 3),
				face: { normal: new Vector3(0, 1, 0) }
			},
			'fixpoint'
		);
		expect(state.topo.fixPoints[0].position3D).toEqual([1, 2, 3]);
		expect(state.topo.fixPoints[0]).not.toHaveProperty('position');

		manager.currentClickData = [
			{ point: new Vector3(1, 2, 3), normal: new Vector3(0, 1, 0), mesh: null }
		];
		manager.currentLineSegments = [
			{
				id: 0,
				points: [],
				pointsData: [
					{ point: new Vector3(1, 2, 3), normal: new Vector3(0, 1, 0) },
					{ point: new Vector3(4, 5, 6), normal: new Vector3(0, 1, 0) }
				]
			}
		];
		manager.finalizeRouteOrPitch('route');
		expect(state.topo.routes[0].points3D).toEqual([
			[1, 2, 3],
			[4, 5, 6]
		]);
		expect(state.topo.routes[0].orientation3D).toEqual([0, 1, 0]);
		expect(state.topo.routes[0]).not.toHaveProperty('points');
	});

	it('writes multipitch geometry to points3D', () => {
		const state = createState();
		state.topo.routes.push({ id: 'r1', pitches: [] });
		state.ui.selectedRouteId = 'r1';
		const manager = new Topo3DInteractionManager(state);
		manager.gltfScene = new Group();
		manager.currentClickData = [
			{ point: new Vector3(1, 2, 3), normal: new Vector3(0, 1, 0), mesh: null }
		];
		manager.currentLineSegments = [
			{
				id: 0,
				points: [],
				pointsData: [
					{ point: new Vector3(1, 2, 3), normal: new Vector3(0, 1, 0) },
					{ point: new Vector3(4, 5, 6), normal: new Vector3(0, 1, 0) }
				]
			}
		];

		manager.finalizeRouteOrPitch('multipitch');

		expect(state.topo.routes[0].pitches[0].points3D).toEqual([
			[1, 2, 3],
			[4, 5, 6]
		]);
		expect(state.topo.routes[0].pitches[0]).not.toHaveProperty('points');
	});
});

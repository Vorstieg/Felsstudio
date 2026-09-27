// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
	buildGeometryEditorFeatures,
	cloneGeoJsonGeometry,
	useCragGeometryEditor
} from './use-crag-geometry-editor.svelte.ts';

describe('geometry editor overlay', () => {
	it('clones reactive geometry proxies into plain GeoJSON', () => {
		const geometry = new Proxy({ type: 'Point', coordinates: new Proxy([16, 48], {}) }, {});

		expect(cloneGeoJsonGeometry(geometry)).toEqual({ type: 'Point', coordinates: [16, 48] });
		expect(() => structuredClone(geometry)).toThrow();
	});

	it('renders one point handle for point geometry', () => {
		expect(buildGeometryEditorFeatures({ type: 'Point', coordinates: [16, 48] })).toEqual([
			expect.objectContaining({ properties: { handle: 'point' } })
		]);
	});

	it('omits edit handles when geometry editing is unavailable', () => {
		const pointFeatures = buildGeometryEditorFeatures(
			{ type: 'Point', coordinates: [16, 48] },
			null,
			false
		);
		const polygonFeatures = buildGeometryEditorFeatures(
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[2, 0],
						[2, 2],
						[0, 0]
					]
				]
			},
			null,
			false
		);

		expect(pointFeatures.map((feature) => feature.properties.handle)).toEqual(['display-point']);
		expect(polygonFeatures.map((feature) => feature.properties.handle)).toEqual(['polygon']);
	});

	it('renders a polygon center, exterior vertices and insertion midpoints only', () => {
		const features = buildGeometryEditorFeatures(
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[2, 0],
						[2, 2],
						[0, 0]
					],
					[
						[0.5, 0.5],
						[1, 0.5],
						[0.5, 0.5]
					]
				]
			},
			1
		);

		expect(features.filter((feature) => feature.properties.handle === 'center')).toHaveLength(1);
		expect(features.filter((feature) => feature.properties.handle === 'vertex')).toHaveLength(3);
		expect(features.filter((feature) => feature.properties.handle === 'midpoint')).toHaveLength(3);
		expect(features.find((feature) => feature.properties.selected)?.properties.vertexIndex).toBe(1);
	});

	it('moves a geometry to the current map center without changing its shape', () => {
		const geometry = {
			type: 'Polygon',
			coordinates: [
				[
					[10, 20],
					[12, 20],
					[12, 22],
					[10, 22],
					[10, 20]
				]
			]
		};
		const state = {
			activeMetadataTarget: { type: 'entry', key: 'current' },
			getMetadataTarget: () => ({ geometry }),
			commitGeometry: vi.fn()
		};
		const editor = useCragGeometryEditor({
			state,
			getMap: () => ({ getCenter: () => ({ lng: 30, lat: 40 }) }),
			getActiveTool: () => 'geometry'
		});

		expect(editor.moveTargetToMapCenter()).toBe(true);
		expect(state.commitGeometry).toHaveBeenCalledWith(
			state.activeMetadataTarget,
			{
				type: 'Polygon',
				coordinates: [
					[
						[29, 39],
						[31, 39],
						[31, 41],
						[29, 41],
						[29, 39]
					]
				]
			},
			'Move geometry to map center'
		);
	});

	it('commits geometry drag edits to a string workspace target', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', { maxTouchPoints: 0 });
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		const handlers = new Map();
		const sources = new Map();
		const map = {
			dragPan: { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true },
			touchZoomRotate: { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true },
			getCanvas: () => ({ style: {} }),
			getSource: (id) => sources.get(id) || null,
			addSource: (id, source) => sources.set(id, { ...source, setData: vi.fn() }),
			getLayer: vi.fn(() => null),
			addLayer: vi.fn(),
			on(...args) {
				handlers.set(args.slice(0, -1).join(':'), args.at(-1));
			},
			off: vi.fn()
		};
		const state = {
			activeMetadataTarget: 'country/wall',
			getMetadataTarget: () => ({ geometry: { type: 'Point', coordinates: [16, 48] } }),
			commitGeometry: vi.fn()
		};
		const editor = useCragGeometryEditor({
			state,
			getMap: () => map,
			getActiveTool: () => 'geometry'
		});
		editor.initHandlers(map);
		editor.syncDrawing();
		handlers.get('mousedown:geometry-editor-point')({
			features: [{ properties: {} }],
			preventDefault: vi.fn(),
			lngLat: { lng: 16, lat: 48 }
		});
		handlers.get('mousemove')({ lngLat: { lng: 17, lat: 49 } });
		handlers.get('mouseup')({ lngLat: { lng: 17, lat: 49 } });

		expect(state.commitGeometry).toHaveBeenCalledWith(
			'country/wall',
			{ type: 'Point', coordinates: [17, 49] },
			'Move point geometry'
		);
		vi.unstubAllGlobals();
	});

	it('recreates style layers without registering duplicate handlers and cannot drag in select mode', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', { maxTouchPoints: 0 });
		const sources = new Map();
		const layers = new Map();
		const handlers = new Map();
		let onCount = 0;
		const dragPan = { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true };
		const map = {
			dragPan,
			touchZoomRotate: { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true },
			getCanvas: () => ({ style: {} }),
			getSource: (id) => sources.get(id),
			addSource: (id, value) => sources.set(id, { ...value, setData: vi.fn() }),
			getLayer: (id) => layers.get(id),
			addLayer: (layer) => layers.set(layer.id, layer),
			on(...args) {
				onCount += 1;
				handlers.set(args.slice(0, -1).join(':'), args.at(-1));
			},
			off() {},
			easeTo() {},
			getZoom: () => 12
		};
		const state = {
			activeMetadataTarget: { type: 'entry', key: 'current' },
			getMetadataTarget: () => ({ geometry: { type: 'Point', coordinates: [16, 48] } }),
			commitGeometry: vi.fn()
		};
		const editor = useCragGeometryEditor({
			state,
			getMap: () => map,
			getActiveTool: () => 'select'
		});

		editor.initHandlers(map);
		const initialOnCount = onCount;
		sources.clear();
		layers.clear();
		editor.initHandlers(map);

		expect(sources.has('geometry-editor-data')).toBe(true);
		expect(layers.has('geometry-editor-point')).toBe(true);
		expect(onCount).toBe(initialOnCount);
		handlers.get('mousedown:geometry-editor-point')?.({
			features: [{ properties: {} }],
			preventDefault: vi.fn(),
			lngLat: { lng: 16, lat: 48 }
		});
		expect(dragPan.disable).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('can clean up after MapLibre has removed the map style', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', { maxTouchPoints: 0 });
		const map = {
			dragPan: { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true },
			touchZoomRotate: { disable: vi.fn(), enable: vi.fn(), isEnabled: () => true },
			getCanvas: () => ({ style: {} }),
			isStyleLoaded: vi.fn(() => true),
			getSource: vi.fn(() => {
				throw new TypeError("Cannot read properties of undefined (reading 'getSource')");
			}),
			addSource: vi.fn(),
			getLayer: vi.fn(),
			addLayer: vi.fn(),
			on: vi.fn(),
			off: vi.fn()
		};
		const editor = useCragGeometryEditor({
			state: { activeMetadataTarget: null, getMetadataTarget: () => null },
			getMap: () => map,
			getActiveTool: () => 'select'
		});

		// Set up the handler map directly without adding layers to the removed style.
		map.getSource.mockReturnValueOnce({ setData: vi.fn() });
		editor.initHandlers(map);
		map.isStyleLoaded.mockReturnValue(false);

		expect(() => editor.cleanup()).not.toThrow();
		expect(map.getSource).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});
});

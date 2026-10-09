import { describe, expect, it } from 'vitest';
import {
	createOutline,
	createPresetShape,
	editOutlinePath,
	prepareOutlinesForExport,
	setOutlinePoint,
	updatePresetOutline
} from './outline-geometry.ts';
import { insertPathVertex, removePathVertex } from './path-geometry.ts';

describe('outline geometry', () => {
	it('keeps unfinished points in drafts and omits them from exported document paths', () => {
		const draft = createOutline({ id: 'draft', points2D: [[1, 2]] });
		const [exported] = prepareOutlinesForExport([draft]);
		expect(draft.points2D).toEqual([[1, 2]]);
		expect(exported.points2D).toBeUndefined();
	});

	it('changes preset geometry without mutating its source or metadata', () => {
		const shape = createPresetShape('slab', [0, 0], [1, 1], { semantic: { custom: 7 } });
		const outline = createOutline({ id: 'slab', shape, points2D: shape.points2D });
		const before = structuredClone(outline);
		const updated = updatePresetOutline(outline, { width: 2, lean: 0.2 });

		expect(outline).toEqual(before);
		expect(updated.points2D).not.toEqual(outline.points2D);
		expect(updated.points2D[0]).toEqual(updated.points2D.at(-1));
		expect(updated.shape.semantic).toMatchObject({ width: 2, lean: 0.2, custom: 7 });
		expect(updated.curve).toEqual(outline.curve);
		expect(updated.shape).not.toHaveProperty('points2D');
	});

	it('updates closure when editing and detaches preset metadata', () => {
		const outline = createOutline({
			id: 'ring',
			shape: { type: 'polyline', preset: 'slab' },
			points2D: [
				[0, 0],
				[2, 0],
				[2, 2],
				[0, 2],
				[0, 0]
			]
		});
		editOutlinePath(outline, (points) => insertPathVertex(points, 0, [-1, 0]));
		expect(outline.shape).toEqual({ type: 'polyline' });
		expect(outline.points2D[0]).toEqual([-1, 0]);
		expect(outline.points2D.at(-1)).toEqual([-1, 0]);
		expect(outline.closed).toBe(true);
		editOutlinePath(outline, (points) => removePathVertex(points, 0));
		setOutlinePoint(outline, outline.points2D.length - 1, [1, 1]);
		expect(outline.points2D[0]).toEqual([1, 1]);
		expect(outline.points2D.at(-1)).toEqual([1, 1]);
	});

	it('resizes circles through their semantic radius', () => {
		const outline = createOutline({
			id: 'circle',
			shape: { type: 'circle', center2D: [0.5, 0.5], radius2D: 0.1 }
		});
		setOutlinePoint(outline, 0, [0.75, 0.5]);
		expect(outline.shape).toMatchObject({ type: 'circle', radius2D: 0.25 });
		expect(outline.points2D[0]).toEqual([0.75, 0.5]);
		expect(outline.closed).toBe(true);
	});

	it('exports shape geometry without modifying the draft', () => {
		const draft = {
			id: 'rectangle',
			points2D: [],
			shape: { type: 'rectangle', start2D: [0, 0], end2D: [1, 1] }
		};
		const [exported] = prepareOutlinesForExport([draft]);
		expect(draft.points2D).toEqual([]);
		expect(draft).not.toHaveProperty('closed');
		expect(exported.points2D).toHaveLength(5);
		expect(exported.closed).toBe(true);
	});
});

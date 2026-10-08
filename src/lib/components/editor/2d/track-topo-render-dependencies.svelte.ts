import { getOutlinePoints } from '$lib/assets/js/outline-geometry.ts';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { TopoRenderContext } from './topo-render-context.ts';

type RenderDependencies = Pick<
	TopoRenderContext,
	| 'topo'
	| 'currentRoutePoints'
	| 'currentOutlinePoints'
	| 'brushPreview'
	| 'baseWidth'
	| 'baseHeight'
>;

/**
 * Reads every nested value that the imperative renderer consumes. Svelte's
 * effect tracking then invalidates the render when an editor object is
 * mutated in place.
 */
export function trackTopoRenderDependencies({
	topo,
	currentRoutePoints,
	currentOutlinePoints,
	brushPreview,
	baseWidth,
	baseHeight
}: RenderDependencies): void {
	for (const route of topo.routes) {
		void route.lineStyle;
		void route.grade?.scale;
		void route.grade?.value;
		void route.grade?.standardizedValue;
		if (route.labelOffset2D) {
			const offset = route.labelOffset2D as unknown as Point2D;
			void [offset[0], offset[1]];
		}
		for (const point of (route.points2D || []) as unknown as Point2D[]) void [point[0], point[1]];
		for (const pitch of route.pitches || []) {
			void pitch.lineStyle;
			void pitch.grade;
			void pitch.grade?.scale;
			void pitch.grade?.value;
			void pitch.grade?.standardizedValue;
			void pitch.length;
			void pitch.pitchNumber;
			if (pitch.labelOffset2D) {
				const offset = pitch.labelOffset2D as unknown as Point2D;
				void [offset[0], offset[1]];
			}
			for (const point of (pitch.points2D || []) as unknown as Point2D[]) void [point[0], point[1]];
		}
		for (const variant of route.variants || []) {
			void variant.name;
			void variant.lineStyle;
			void variant.grade;
			void variant.length;
			if (variant.labelOffset2D) {
				const offset = variant.labelOffset2D as unknown as Point2D;
				void [offset[0], offset[1]];
			}
			for (const point of (variant.points2D || []) as unknown as Point2D[])
				void [point[0], point[1]];
		}
	}
	for (const outline of topo.outlines) {
		const shape = outline.shape as
			(NonNullable<typeof outline.shape> & { fromCenter?: boolean; square?: boolean }) | undefined;
		void outline.lineStyle;
		void outline.fillColor;
		void outline.fillOpacity;
		void outline.closed;
		void shape?.type;
		void shape?.radius2D;
		void shape?.fromCenter;
		void shape?.square;
		for (const point of getOutlinePoints(outline, { baseWidth, baseHeight }))
			void [point[0], point[1]];
	}
	for (const symbol of topo.fixPoints) {
		if (symbol.position2D) {
			void symbol.position2D[0];
			void symbol.position2D[1];
			void symbol.rotation2D;
			void symbol.scale2D;
			void symbol.scaleX2D;
			void symbol.scaleY2D;
		}
	}
	for (const label of topo.textLabels || []) {
		void label.text;
		void label.fontSize2D;
		void label.color;
		void label.fontWeight;
		void label.textAlign2D;
		if (label.position2D) void [label.position2D[0], label.position2D[1]];
	}
	for (const point of currentRoutePoints) void [point[0], point[1]];
	for (const point of currentOutlinePoints) void [point[0], point[1]];
	for (const point of brushPreview?.points || []) void [point[0], point[1]];
	for (const point of brushPreview?.contourPoints || []) void [point[0], point[1]];
}

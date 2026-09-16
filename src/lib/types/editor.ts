import type { Point2D } from '@vorstieg/fels-data/types';

export type SelectionId = string | number;

export type EditorSelection = {
	type: 'route' | 'pitch' | 'fixPoint' | 'outline' | 'textLabel' | 'path' | 'point';
	id: SelectionId;
	pointIndex?: number;
};

export type DragState = {
	start: Point2D;
	current: Point2D;
	selection?: EditorSelection;
};

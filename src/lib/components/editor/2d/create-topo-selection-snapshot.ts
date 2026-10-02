import type { Point2D } from '$lib/assets/js/path-geometry.ts';
import type {
	EditablePathTarget,
	InteractionPoint,
	SelectionSnapshot
} from '$lib/state/topo-2d-editor-interactions.ts';
import type { Topo2DEditorDocument } from '$lib/state/topo-2d-editor-initial-state.ts';
import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';
import type { EditablePath } from './editable-path.ts';

type SelectionSnapshotOptions = {
	getTopo: () => Pick<Topo2DEditorDocument, 'routes' | 'fixPoints' | 'textLabels'>;
	selectedItems: ReadonlySet<string>;
	drawingTarget?: TopoDrawingTarget | null;
	getEditablePath: (target: EditablePathTarget) => EditablePath | null;
	startMouse: InteractionPoint;
};

/** Builds a stable snapshot used by move-selection interactions. */
export function createTopoSelectionSnapshot({
	getTopo,
	selectedItems,
	drawingTarget,
	getEditablePath,
	startMouse
}: SelectionSnapshotOptions): SelectionSnapshot {
	const paths: SelectionSnapshot['items']['paths'] = [];
	const symbols: SelectionSnapshot['items']['symbols'] = [];
	const texts: SelectionSnapshot['items']['texts'] = [];
	const isMultiSelection = selectedItems.size > 1;
	const addPath = (target: EditablePathTarget) => {
		const path = getEditablePath(target);
		if (path?.getPoints().length) paths.push({ target, snapshot: path.snapshot() });
	};

	selectedItems.forEach((itemKey) => {
		const [type, id] = itemKey.split(':');
		if (!id) return;
		if (type === 'route') {
			const route = getTopo().routes.find((item) => String(item.id) === id);
			if (!route) return;
			const selectedPitchId =
				!isMultiSelection && drawingTarget?.type === 'pitch' && drawingTarget.routeId === route.id
					? drawingTarget.pitchId
					: null;
			const selectedVariantId =
				!isMultiSelection && drawingTarget?.type === 'variant' && drawingTarget.routeId === route.id
					? drawingTarget.variantId
					: null;

			if (route.points2D && !selectedPitchId && !selectedVariantId) {
				addPath({ routeId: route.id });
			}
			(route.pitches || []).forEach((pitch) => {
				if ((!selectedPitchId || pitch.id === selectedPitchId) && pitch.points2D) {
					addPath({ routeId: route.id, pitchId: pitch.id });
				}
			});
			(route.variants || []).forEach((variant) => {
				if ((!selectedVariantId || variant.id === selectedVariantId) && variant.points2D) {
					addPath({ routeId: route.id, variantId: variant.id });
				}
			});
		} else if (type === 'outline') {
			addPath({ outlineId: id });
		} else if (type === 'symbol') {
			const symbol = getTopo().fixPoints.find((item) => String(item.id) === id);
			if (symbol?.position2D)
				symbols.push({ symbolId: id, startPos: [...symbol.position2D] as Point2D });
		} else if (type === 'text') {
			const label = (getTopo().textLabels || []).find((item) => String(item.id) === id);
			if (label?.position2D) texts.push({ textId: id, startPos: [...label.position2D] as Point2D });
		}
	});

	return { items: { paths, symbols, texts }, startMouse };
}

import { generateOutlineId, generateSymbolId, generateTextId } from '$lib/assets/js/id-utils.ts';
import { translateOutline } from '$lib/assets/js/outline-geometry.ts';
import type { OutlineRecord } from '$lib/assets/js/outline-geometry.ts';
import type { FixPoint, TextLabel } from '@vorstieg/fels-types/types';

type ClipboardTopo = {
	outlines: OutlineRecord[];
	fixPoints: FixPoint[];
	textLabels?: TextLabel[];
};
type CanvasSize = { baseWidth: number; baseHeight: number };
type ClipboardItem =
	| { type: 'outline'; item: OutlineRecord }
	| { type: 'symbol'; item: FixPoint }
	| { type: 'text'; item: TextLabel };
type PastedItem = { type: ClipboardItem['type']; id: string | number };

const PASTE_OFFSET_PX = 16;

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * An editor-local clipboard for topo objects. It intentionally stores the
 * source objects, rather than browser clipboard text, so it also works in
 * embedded and non-secure editor contexts.
 */
export function createTopoClipboard() {
	let contents: ClipboardItem[] = [];
	let pasteCount = 0;

	function copy({
		topo,
		selectedItems
	}: {
		topo: ClipboardTopo;
		selectedItems: Iterable<string>;
	}): number {
		const selected = new Set(selectedItems);
		contents = [
			...topo.outlines
				.filter((outline) => selected.has(`outline:${outline.id}`))
				.map((item) => ({ type: 'outline' as const, item: clone(item) })),
			...topo.fixPoints
				.filter((symbol) => selected.has(`symbol:${symbol.id}`))
				.map((item) => ({ type: 'symbol' as const, item: clone(item) })),
			...(topo.textLabels || [])
				.filter((label) => selected.has(`text:${label.id}`))
				.map((item) => ({ type: 'text' as const, item: clone(item) }))
		];
		pasteCount = 0;
		return contents.length;
	}

	function paste({
		topo,
		canvasSize
	}: {
		topo: ClipboardTopo;
		canvasSize: CanvasSize;
	}): PastedItem[] {
		if (!contents.length) return [];
		pasteCount += 1;
		const deltaX = (PASTE_OFFSET_PX * pasteCount) / canvasSize.baseWidth;
		const deltaY = (PASTE_OFFSET_PX * pasteCount) / canvasSize.baseHeight;
		const pasted: PastedItem[] = [];

		contents.forEach((content) => {
			if (content.type === 'outline') {
				const duplicate = clone(content.item);
				duplicate.id = generateOutlineId();
				translateOutline(duplicate, deltaX, deltaY, canvasSize);
				topo.outlines.push(duplicate);
				pasted.push({ type: content.type, id: duplicate.id });
			} else if (content.type === 'symbol') {
				const duplicate = clone(content.item);
				duplicate.id = generateSymbolId();
				if (Array.isArray(duplicate.position2D)) {
					duplicate.position2D = [
						duplicate.position2D[0] + deltaX,
						duplicate.position2D[1] + deltaY
					];
				}
				topo.fixPoints.push(duplicate);
				pasted.push({ type: content.type, id: duplicate.id });
			} else {
				const duplicate = clone(content.item);
				do duplicate.id = generateTextId();
				while ((topo.textLabels || []).some((label) => label.id === duplicate.id));
				if (duplicate.position2D)
					duplicate.position2D = [
						duplicate.position2D[0] + deltaX,
						duplicate.position2D[1] + deltaY
					];
				if (!topo.textLabels) topo.textLabels = [];
				topo.textLabels.push(duplicate);
				pasted.push({ type: content.type, id: duplicate.id });
			}
		});

		return pasted;
	}

	return { copy, paste };
}

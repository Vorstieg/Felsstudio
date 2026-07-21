import { generateOutlineId, generateSymbolId } from '$lib/assets/js/id-utils.js';
import { translateOutline } from '$lib/assets/js/outline-geometry.js';

const PASTE_OFFSET_PX = 16;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * An editor-local clipboard for topo objects. It intentionally stores the
 * source objects, rather than browser clipboard text, so it also works in
 * embedded and non-secure editor contexts.
 */
export function createTopoClipboard() {
	let contents = [];
	let pasteCount = 0;

	function copy({ topo, selectedItems }) {
		const selected = new Set(selectedItems);
		contents = [
			...topo.outlines
				.filter((outline) => selected.has(`outline:${outline.id}`))
				.map((item) => ({ type: 'outline', item: clone(item) })),
			...topo.fixPoints
				.filter((symbol) => selected.has(`symbol:${symbol.id}`))
				.map((item) => ({ type: 'symbol', item: clone(item) }))
		];
		pasteCount = 0;
		return contents.length;
	}

	function paste({ topo, canvasSize }) {
		if (!contents.length) return [];
		pasteCount += 1;
		const deltaX = (PASTE_OFFSET_PX * pasteCount) / canvasSize.baseWidth;
		const deltaY = (PASTE_OFFSET_PX * pasteCount) / canvasSize.baseHeight;
		const pasted = [];

		contents.forEach(({ type, item }) => {
			const duplicate = clone(item);
			if (type === 'outline') {
				duplicate.id = generateOutlineId();
				translateOutline(duplicate, deltaX, deltaY, canvasSize);
				topo.outlines.push(duplicate);
			} else {
				duplicate.id = generateSymbolId();
				if (Array.isArray(duplicate.position2D)) {
					duplicate.position2D = [
						duplicate.position2D[0] + deltaX,
						duplicate.position2D[1] + deltaY
					];
				}
				topo.fixPoints.push(duplicate);
			}
			pasted.push({ type, id: duplicate.id });
		});

		return pasted;
	}

	return { copy, paste };
}

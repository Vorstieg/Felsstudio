let routeIdCounter = 1;
let outlineIdCounter = 1;
let symbolIdCounter = 1;
let textIdCounter = 1;
let genericIdCounter = 1;

export function generateRouteId(): string {
	return `route-${routeIdCounter++}`;
}

export function generateOutlineId(): string {
	return `outline-${outlineIdCounter++}`;
}

export function generateSymbolId(): string {
	return `symbol-${symbolIdCounter++}`;
}

export function generateTextId(): string {
	return `text-${textIdCounter++}`;
}

export function generateId(prefix = 'id'): string {
	return `${prefix}-${genericIdCounter++}`;
}

type ItemWithId = { id?: string | number };
type IdCounterTopo = {
	routes?: Array<ItemWithId & { pitches?: ItemWithId[] }>;
	outlines?: ItemWithId[];
	fixPoints?: ItemWithId[];
	textLabels?: ItemWithId[];
};

function findMaxId(items: ItemWithId[] | undefined, prefix: string): number {
	let max = 0;
	if (!items) return max;
	items.forEach((item) => {
		if (item && typeof item.id === 'string' && item.id.startsWith(prefix)) {
			const suffix = item.id.slice(prefix.length);
			const num = parseInt(suffix, 10);
			if (!Number.isNaN(num)) max = Math.max(max, num);
		}
	});
	return max;
}

export function initializeIdCounters(topo: IdCounterTopo | null | undefined): void {
	if (!topo) return;

	routeIdCounter = findMaxId(topo.routes, 'route-') + 1;
	outlineIdCounter = findMaxId(topo.outlines, 'outline-') + 1;
	symbolIdCounter = findMaxId(topo.fixPoints, 'symbol-') + 1;
	textIdCounter = findMaxId(topo.textLabels, 'text-') + 1;

	topo.routes?.forEach((r) => {
		if (r.pitches) {
			const pitchMax = findMaxId(r.pitches, 'pitch-');
			genericIdCounter = Math.max(genericIdCounter, pitchMax + 1);
		}
	});
}

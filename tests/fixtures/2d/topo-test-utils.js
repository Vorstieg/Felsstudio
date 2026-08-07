export function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function normalizeTopo(topo) {
	const normalized = clone(topo);
	delete normalized.updated;
	delete normalized.date;
	return normalized;
}

export function selectedKeys(...items) {
	return items.map(({ type, id }) => `${type}:${id}`);
}

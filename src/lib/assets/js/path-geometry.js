export function clonePath(points = []) {
	return points.map((point) => [...point]);
}

export function pointsEqual(a, b) {
	return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

export function isClosedPath(points = []) {
	return points.length > 2 && pointsEqual(points[0], points[points.length - 1]);
}

export function closePath(points = []) {
	const next = clonePath(points);
	if (next.length === 0 || isClosedPath(next)) return next;
	next.push([...next[0]]);
	return next;
}

export function getEditablePath(points = [], { closed = isClosedPath(points) } = {}) {
	const next = clonePath(points);
	return closed && isClosedPath(next) ? next.slice(0, -1) : next;
}

export function normalizePath(points = [], { closed = isClosedPath(points) } = {}) {
	const next = getEditablePath(points, { closed });
	return closed ? closePath(next) : next;
}

export function movePathVertex(
	points,
	index,
	position,
	{ closed = isClosedPath(points) } = {}
) {
	const next = normalizePath(points, { closed });
	const editableLength = closed ? next.length - 1 : next.length;
	if (editableLength === 0) return next;
	const vertexIndex = closed && index === next.length - 1 ? 0 : index;
	if (vertexIndex < 0 || vertexIndex >= editableLength) return next;
	next[vertexIndex] = [...position];
	if (closed && vertexIndex === 0) next[next.length - 1] = [...position];
	return next;
}

export function insertPathVertex(
	points,
	index,
	position,
	{ closed = isClosedPath(points) } = {}
) {
	const editable = getEditablePath(points, { closed });
	const insertIndex = Math.max(0, Math.min(index, editable.length));
	editable.splice(insertIndex, 0, [...position]);
	return closed ? closePath(editable) : editable;
}

export function removePathVertex(
	points,
	index,
	{ closed = isClosedPath(points), minPoints = closed ? 3 : 2 } = {}
) {
	const editable = getEditablePath(points, { closed });
	const vertexIndex = closed && index === points.length - 1 ? 0 : index;
	if (editable.length <= minPoints || vertexIndex < 0 || vertexIndex >= editable.length) {
		return normalizePath(points, { closed });
	}
	editable.splice(vertexIndex, 1);
	return closed ? closePath(editable) : editable;
}

export function translatePath(points, delta, { closed = isClosedPath(points) } = {}) {
	return normalizePath(
		getEditablePath(points, { closed }).map((point) => [
			point[0] + delta[0],
			point[1] + delta[1]
		]),
		{ closed }
	);
}

export function getPathMidpoints(points, { closed = isClosedPath(points) } = {}) {
	const normalized = normalizePath(points, { closed });
	const midpoints = [];
	for (let index = 0; index < normalized.length - 1; index++) {
		const start = normalized[index];
		const end = normalized[index + 1];
		midpoints.push({
			index,
			insertIndex: index + 1,
			point: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
		});
	}
	return midpoints;
}

import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.js';

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Domain mutations shared by tools, keyboard shortcuts and the toolbar.
 *
 * Commands deliberately do not know about Svelte components. The caller
 * supplies the document and the small services needed to keep selection and
 * history consistent.
 */
export function createTopoEditCommands({ getTopo, selection, saveHistory } = {}) {
	const readTopo = getTopo || (() => ({}));
	const select = selection || { selectObject() {}, removeItems() {} };
	const record = saveHistory || (() => {});

	function commit(mutator = () => {}) {
		const result = mutator();
		record();
		return result;
	}

	function createTextLabel(point, values = {}) {
		const topo = readTopo();
		const label = {
			id: generateId('text'),
			text: 'Text',
			position2D: [point.x, point.y],
			fontSize2D: 0.025,
			color: '#23201d',
			fontWeight: 700,
			...values
		};
		topo.textLabels = [...(topo.textLabels || []), label];
		select.selectObject('text', label.id);
		record();
		return label.id;
	}

	function createSymbol(point, type, values = {}) {
		const symbol = {
			id: generateSymbolId(),
			type,
			position2D: [point.x, point.y],
			rotation2D: 0,
			scale2D: 1,
			scaleX2D: 1,
			scaleY2D: 1,
			...values
		};
		readTopo().fixPoints.push(symbol);
		record();
		return symbol.id;
	}

	function addRoute(route, { recordHistory = true } = {}) {
		readTopo().routes.push(route);
		if (recordHistory) record();
		return route;
	}

	function addOutline(outline, { recordHistory = true } = {}) {
		readTopo().outlines.push(outline);
		if (recordHistory) record();
		return outline;
	}

	function appendRoutePoint(routeId, target = {}, point, { recordHistory = true } = {}) {
		const route = (readTopo().routes || []).find((item) => item.id === routeId);
		const path = target.type === 'pitch'
			? route?.pitches?.find((pitch) => pitch.id === target.pitchId)
			: target.type === 'variant'
				? route?.variants?.find((variant) => variant.id === target.variantId)
				: route;
		if (!path) return null;
		path.points2D = [...(path.points2D || []), [point.x, point.y]];
		if (recordHistory) record();
		return path;
	}

	function addPitch(routeId, pitch, { recordHistory = true } = {}) {
		const route = (readTopo().routes || []).find((item) => item.id === routeId);
		if (!route) return false;
		route.pitches = [...(route.pitches || []), pitch];
		if (recordHistory) record();
		return true;
	}

	function appendOutlinePoint(outlineId, point, { recordHistory = true } = {}) {
		const outline = (readTopo().outlines || []).find((item) => item.id === outlineId);
		if (!outline) return false;
		outline.points2D = [...(outline.points2D || []), [point.x, point.y]];
		outline.shape = { type: 'polyline', points2D: outline.points2D };
		if (recordHistory) record();
		return true;
	}

	function updateOutline(id, changes, { recordHistory = true } = {}) {
		const outline = (readTopo().outlines || []).find((item) => item.id === id);
		if (!outline) return false;
		Object.assign(outline, changes);
		if (recordHistory) record();
		return true;
	}

	function updateTextLabel(id, value) {
		const label = (readTopo().textLabels || []).find((item) => item.id === id);
		if (!label) return false;
		label.text = value;
		record();
		return true;
	}

	function moveRouteLabel(routeId, { pitchId = null, variantId = null } = {}, mouse, { recordHistory = false } = {}) {
		const route = (readTopo().routes || []).find((item) => item.id === routeId);
		const target = pitchId
			? route?.pitches?.find((pitch) => pitch.id === pitchId)
			: variantId
				? route?.variants?.find((variant) => variant.id === variantId)
				: route;
		if (!target?.points2D?.length) return false;

		const basePoint = target.points2D[0];
		target.labelOffset2D = [mouse.x - basePoint[0], mouse.y - basePoint[1]];
		if (recordHistory) record();
		return true;
	}

	function deleteTextLabels(ids, { recordHistory = true } = {}) {
		const idSet = new Set(ids);
		const topo = readTopo();
		const before = topo.textLabels || [];
		topo.textLabels = before.filter((label) => !idSet.has(label.id));
		const changed = topo.textLabels.length !== before.length;
		if (changed) {
			select.removeItems(ids.map((id) => ({ type: 'text', id })));
			if (recordHistory) record();
		}
		return changed;
	}

	function deleteOutlines(ids, { recordHistory = true } = {}) {
		const idSet = new Set(ids);
		const topo = readTopo();
		const before = topo.outlines || [];
		topo.outlines = before.filter((outline) => !idSet.has(outline.id));
		const changed = topo.outlines.length !== before.length;
		if (changed) {
			select.removeItems(ids.map((id) => ({ type: 'outline', id })));
			if (recordHistory) record();
		}
		return changed;
	}

	function deleteSymbols(ids, { recordHistory = true } = {}) {
		const topo = readTopo();
		const idSet = new Set(ids);
		const before = topo.fixPoints || [];
		if (!before.some((item) => idSet.has(item.id))) return false;

		topo.fixPoints = before.filter((item) => !idSet.has(item.id));
		for (const route of topo.routes || []) {
			route.fixPoints = (route.fixPoints || []).filter((id) => !idSet.has(id));
			for (const pitch of route.pitches || []) {
				if (idSet.has(pitch.startNodeId)) pitch.startNodeId = null;
				if (idSet.has(pitch.endNodeId)) pitch.endNodeId = null;
			}
		}
		select.removeItems([...idSet].map((id) => ({ type: 'symbol', id })));
		if (recordHistory) record();
		return true;
	}

	function deleteRoutes(ids, { recordHistory = true } = {}) {
		const topo = readTopo();
		const idSet = new Set(ids);
		const before = topo.routes || [];
		if (!before.some((route) => idSet.has(route.id))) return false;
		topo.routes = before.filter((route) => !idSet.has(route.id));
		select.removeItems([...idSet].map((id) => ({ type: 'route', id })));
		if (recordHistory) record();
		return true;
	}

	function deleteSymbolAt(point, tolerance = 0.02) {
		const symbol = (readTopo().fixPoints || []).find((item) => {
			if (!item.position2D) return false;
			return (
				Math.abs(item.position2D[0] - point.x) < tolerance &&
				Math.abs(item.position2D[1] - point.y) < tolerance
			);
		});
		return symbol ? deleteSymbols([symbol.id]) : false;
	}

	function deleteSelection(selectedItems = []) {
		const idsByType = { route: [], symbol: [], outline: [], text: [] };
		for (const itemKey of selectedItems) {
			const [type, id] = itemKey.split(':');
			if (idsByType[type] && id) idsByType[type].push(id);
		}

		const changed = [
			idsByType.route.length && deleteRoutes(idsByType.route, { recordHistory: false }),
			idsByType.symbol.length && deleteSymbols(idsByType.symbol, { recordHistory: false }),
			idsByType.outline.length && deleteOutlines(idsByType.outline, { recordHistory: false }),
			idsByType.text.length && deleteTextLabels(idsByType.text, { recordHistory: false })
		].some(Boolean);
		if (!changed) return false;

		select.clear?.();
		record();
		return true;
	}

	function snapshotItems(idsByType) {
		const topo = readTopo();
		return {
			routes: (topo.routes || []).filter((item) => idsByType.route?.includes(item.id)).map(clone),
			symbols: (topo.fixPoints || [])
				.filter((item) => idsByType.symbol?.includes(item.id))
				.map(clone),
			outlines: (topo.outlines || [])
				.filter((item) => idsByType.outline?.includes(item.id))
				.map(clone),
			texts: (topo.textLabels || []).filter((item) => idsByType.text?.includes(item.id)).map(clone)
		};
	}

	return {
		commit,
		createTextLabel,
		createSymbol,
		addRoute,
		addOutline,
		appendRoutePoint,
		addPitch,
		appendOutlinePoint,
		updateOutline,
		updateTextLabel,
		moveRouteLabel,
		deleteTextLabels,
		deleteOutlines,
		deleteSymbolAt,
		deleteSelection,
		deleteSymbols,
		deleteRoutes,
		snapshotItems
	};
}

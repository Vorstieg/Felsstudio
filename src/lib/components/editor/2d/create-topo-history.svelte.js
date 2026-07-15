function snapshot(topo) {
	return JSON.parse(
		JSON.stringify({
			routes: topo.routes,
			fixPoints: topo.fixPoints,
			outlines: topo.outlines,
			textLabels: topo.textLabels || []
		})
	);
}

/** Owns topo-edit history independently of input and rendering. */
export function createTopoHistory({ getTopo, restore }) {
	let entries = $state([]);
	let index = $state(-1);

	function save() {
		if (index < entries.length - 1) entries = entries.slice(0, index + 1);
		entries.push(snapshot(getTopo()));
		if (entries.length > 50) entries.shift();
		else index = entries.length - 1;
	}

	function undo() {
		if (index <= 0) return false;
		index--;
		restore(entries[index]);
		return true;
	}

	function redo() {
		if (index >= entries.length - 1) return false;
		index++;
		restore(entries[index]);
		return true;
	}

	return { save, undo, redo };
}

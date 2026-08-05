function snapshot(topo) {
	return JSON.parse(JSON.stringify(topo));
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

	function clear() {
		entries = [];
		index = -1;
	}

	function redo() {
		if (index >= entries.length - 1) return false;
		index++;
		restore(entries[index]);
		return true;
	}

	return { save, undo, redo, clear };
}

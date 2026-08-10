// Vite expands this to immutable browser URLs and emits the SVGs with the consuming app's build.
const iconUrls = import.meta.glob('../assets/topo-symbols/*.svg', {
	query: '?url',
	eager: true,
	import: 'default'
});

const fixpoints = ['bolt', 'piton', 'hourglass', 'belay', 'abseil'];
const features = [
	'arete',
	'band',
	'bivouac',
	'cave',
	'chimney',
	'chockstone',
	'corner',
	'cornice',
	'crack',
	'crux',
	'dwarf-pine',
	'fixed-cable',
	'grass',
	'gully',
	'hidden-route',
	'leaf-tree',
	'ledge',
	'needle-tree',
	'overhang',
	'ramp',
	'roof',
	'rubble',
	'shoulder',
	'slab',
	'snow',
	'tree',
	'variant',
	'visible-route',
	'water-streak'
];

const labels = {
	abseil: 'Abseil station',
	arete: 'Arête',
	cave: 'Cave / niche',
	ledge: 'Ledge / band',
	rubble: 'Boulders / rubble',
	snow: 'Snow / firn',
	bivouac: 'Bivouac site',
	'leaf-tree': 'Leaf tree',
	'needle-tree': 'Needle tree',
	'water-streak': 'Water streak'
};

function iconFor(id) {
	return iconUrls[`../assets/topo-symbols/${id}.svg`];
}

/** Canonical topo symbol manifest, including Vite-bundled SVG assets. */
export const topoSymbols = [
	...fixpoints.map((id) => ({
		id,
		name: labels[id] || titleCase(id),
		icon: iconFor(id),
		type: 'fixpoint',
		width: 16,
		height: 16
	})),
	...features.map((id) => ({
		id,
		name: labels[id] || titleCase(id),
		icon: iconFor(id),
		type: 'feature',
		width: 32,
		height: 32
	}))
];

export const fixpointSymbols = topoSymbols.filter((symbol) => symbol.type === 'fixpoint');

function titleCase(value) {
	return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

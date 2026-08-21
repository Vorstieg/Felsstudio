// Keep the asset imports in the package entry point. Vite does not expand
// `import.meta.glob` when it occurs in an installed dependency, but it does
// process explicit `?url` asset imports from dependencies.
import abseil from '../assets/topo-symbols/abseil.svg?url';
import arete from '../assets/topo-symbols/arete.svg?url';
import band from '../assets/topo-symbols/band.svg?url';
import belay from '../assets/topo-symbols/belay.svg?url';
import bivouac from '../assets/topo-symbols/bivouac.svg?url';
import bolt from '../assets/topo-symbols/bolt.svg?url';
import cave from '../assets/topo-symbols/cave.svg?url';
import chimney from '../assets/topo-symbols/chimney.svg?url';
import chockstone from '../assets/topo-symbols/chockstone.svg?url';
import corner from '../assets/topo-symbols/corner.svg?url';
import cornice from '../assets/topo-symbols/cornice.svg?url';
import crack from '../assets/topo-symbols/crack.svg?url';
import crux from '../assets/topo-symbols/crux.svg?url';
import dwarfPine from '../assets/topo-symbols/dwarf-pine.svg?url';
import fixedCable from '../assets/topo-symbols/fixed-cable.svg?url';
import grass from '../assets/topo-symbols/grass.svg?url';
import gully from '../assets/topo-symbols/gully.svg?url';
import hiddenRoute from '../assets/topo-symbols/hidden-route.svg?url';
import hourglass from '../assets/topo-symbols/hourglass.svg?url';
import leafTree from '../assets/topo-symbols/leaf-tree.svg?url';
import ledge from '../assets/topo-symbols/ledge.svg?url';
import needleTree from '../assets/topo-symbols/needle-tree.svg?url';
import overhang from '../assets/topo-symbols/overhang.svg?url';
import piton from '../assets/topo-symbols/piton.svg?url';
import ramp from '../assets/topo-symbols/ramp.svg?url';
import roof from '../assets/topo-symbols/roof.svg?url';
import rubble from '../assets/topo-symbols/rubble.svg?url';
import shoulder from '../assets/topo-symbols/shoulder.svg?url';
import slab from '../assets/topo-symbols/slab.svg?url';
import snow from '../assets/topo-symbols/snow.svg?url';
import tree from '../assets/topo-symbols/tree.svg?url';
import variant from '../assets/topo-symbols/variant.svg?url';
import visibleRoute from '../assets/topo-symbols/visible-route.svg?url';
import waterStreak from '../assets/topo-symbols/water-streak.svg?url';

const iconUrls = {
	abseil,
	arete,
	band,
	belay,
	bivouac,
	bolt,
	cave,
	chimney,
	chockstone,
	corner,
	cornice,
	crack,
	crux,
	'dwarf-pine': dwarfPine,
	'fixed-cable': fixedCable,
	grass,
	gully,
	'hidden-route': hiddenRoute,
	hourglass,
	'leaf-tree': leafTree,
	ledge,
	'needle-tree': needleTree,
	overhang,
	piton,
	ramp,
	roof,
	rubble,
	shoulder,
	slab,
	snow,
	tree,
	variant,
	'visible-route': visibleRoute,
	'water-streak': waterStreak
};

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
	return iconUrls[id];
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

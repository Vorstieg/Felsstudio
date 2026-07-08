export const cragEditorState = $state({
	crag: {
		id: '',
		name: '',
		path: '', // e.g. mödling/efeugrat
		type: ['sports-climbing'],
		tags: [],
		security: '', // e.g. 'Sehr Gut', 'Gut'
		rock_type: '', // e.g. 'limestone'
		description_de: '',
		description_en: '',
		equipment: [], // List of { name, amount, sizes }
		assets: { images: [] }, // Crag-level media assets
		sectors: [], // List of sector objects: { id, name, geometry, type, tags, descriptions, topo, assets }
		topo: {
			site: '',
			link: ''
		},
		geometry: {
			type: 'Point',
			coordinates: [16.37, 48.21]
		},
		date: new Date().toISOString().split('T')[0],
		updated: new Date().toISOString().split('T')[0]
	},

	transit: [], // List of transit points: { id, name, type: 'bus'|'train', coordinates: [lon, lat] }
	parking: [], // List of parking points: { id, coordinates: [lon, lat] }
	tracks: [], // List of tracks: { id, name, coordinates: [[lon, lat], ...] }

	reset() {
		const today = new Date().toISOString().split('T')[0];
		this.crag = {
			id: '',
			name: '',
			path: '',
			type: ['sports-climbing'],
			tags: [],
			security: '',
			rock_type: '',
			description_de: '',
			description_en: '',
			equipment: [],
			assets: { images: [] },
			sectors: [],
			topo: { site: '', link: '' },
			geometry: { type: 'Point', coordinates: [16.37, 48.21] },
			date: today,
			updated: today
		};
		this.transit = [];
		this.parking = [];
		this.tracks = [];
	}
});

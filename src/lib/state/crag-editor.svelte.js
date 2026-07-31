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

	access: { type: 'FeatureCollection', version: 1, features: [] },
	// Route documents stay at their existing on-disk locations. Each item is
	// { path, sectorId: string|null, data, dirty } and data.routes is the source of truth.
	routeDocuments: [],
	selectedRouteKey: null,

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
		this.access = { type: 'FeatureCollection', version: 1, features: [] };
		this.routeDocuments = [];
		this.selectedRouteKey = null;
	}
});

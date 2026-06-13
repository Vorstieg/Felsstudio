import { cragsPerPage } from '$lib/config';

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' } = {}) => {
	const crags = await Promise.all(
		Object.entries(
			import.meta.glob([
				'/src/entries/**/*.json',
				'!/src/entries/**/*-transit*.json',
				'!/src/entries/**/*-parking*.json',
				'!/src/entries/**/*-topo*.json'
			])
		).map(async ([path, resolver]) => {
			const data = (await resolver()).default;
			data.properties.path = path.split('/').slice(3, -1).join('/');
			return data;
		})
	);

	let sortedCrags = crags.sort((a, b) => new Date(b.properties.date) - new Date(a.properties.date));

	if (search) {
		const query = search.toLowerCase();
		sortedCrags = sortedCrags.filter(
			(crag) => {
				const sectors = crag.properties.sectors || [];
				return (
					crag.properties.name.toLowerCase().includes(query) ||
					crag.properties.type.includes(search) ||
					crag.properties.path.toLowerCase().includes(query) ||
					sectors.some((sector) =>
						(sector.name || '').toLowerCase().includes(query) ||
						(sector.id || '').toLowerCase().includes(query) ||
						(sector.type || []).includes(search)
					)
				);
			}
		);
	}

	if (offset) {
		sortedCrags = sortedCrags.slice(offset);
	}

	if (limit && limit < sortedCrags.length && limit !== -1) {
		sortedCrags = sortedCrags.slice(0, limit);
	}

	return sortedCrags;
};

export default fetchCrags;

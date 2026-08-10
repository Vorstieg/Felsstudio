export function addEquipment(equipment = [], item = { name: 'Expressschlingen', amount: 12 }) {
	return [...equipment, item];
}

export function removeEquipment(equipment = [], index) {
	return equipment.filter((_, i) => i !== index);
}

export function createDefaultSector({ sectors = [], cragCoordinates = [] } = {}) {
	const nextNumber = sectors.length + 1;
	return {
		id: `sector-${nextNumber}`,
		name: `Sector ${nextNumber}`,
		sort: nextNumber * 10,
		type: [],
		tags: [],
		security: '',
		rock_type: '',
		wallAzimuth: 0,
		description_de: '',
		description_en: '',
		approach_de: '',
		approach_en: '',
		geometry: {
			type: 'Point',
			coordinates: [...cragCoordinates]
		},
		topo: { site: '', link: '' },
		assets: { topos: [], images: [], models: [], approaches: [] }
	};
}

export function addSector(sectors = [], sector) {
	return [...sectors, sector];
}

export function duplicateSectorById(sectors = [], id) {
	const source = sectors.find((sector) => sector.id === id);
	if (!source) return { sectors, duplicatedId: null };

	const copyId = `${source.id || 'sector'}-copy`;
	const uniqueId = sectors.some((sector) => sector.id === copyId)
		? `${copyId}-${sectors.length + 1}`
		: copyId;

	return {
		duplicatedId: uniqueId,
		sectors: [
			...sectors,
			{
				...JSON.parse(JSON.stringify(source)),
				id: uniqueId,
				name: `${source.name || source.id} Copy`,
				sort: (Number(source.sort) || sectors.length * 10) + 1
			}
		]
	};
}

export function removeSectorById(sectors = [], id) {
	return sectors.filter((sector) => sector.id !== id);
}

export function moveSectorById(sectors = [], id, direction) {
	const reordered = [...sectors];
	const index = reordered.findIndex((sector) => sector.id === id);
	const nextIndex = index + direction;
	if (index < 0 || nextIndex < 0 || nextIndex >= reordered.length) return sectors;

	[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
	return reordered.map((sector, i) => ({ ...sector, sort: (i + 1) * 10 }));
}

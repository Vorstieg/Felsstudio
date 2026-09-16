import type { GeoJSONGeometry } from '@vorstieg/fels-data/types';
import type { CragSector } from '$lib/types/crag';

type EquipmentItem = {
	name: string;
	amount: number;
	[key: string]: unknown;
};

type CreateDefaultSectorOptions = {
	sectors?: CragSector[];
	cragCoordinates?: number[];
};

export function addEquipment(
	equipment: EquipmentItem[] = [],
	item: EquipmentItem = { name: 'Expressschlingen', amount: 12 }
): EquipmentItem[] {
	return [...equipment, item];
}

export function removeEquipment<T>(equipment: T[] = [], index: number): T[] {
	return equipment.filter((_, i) => i !== index);
}

export function createDefaultSector({
	sectors = [],
	cragCoordinates = []
}: CreateDefaultSectorOptions = {}): CragSector {
	const nextNumber = sectors.length + 1;
	return {
		id: `sector-${nextNumber}`,
		name: `Sector ${nextNumber}`,
		type: [],
		tags: [],
		security: '',
		rock_type: '',
		description_de: '',
		description_en: '',
		geometry: {
			type: 'Point',
			coordinates: [...cragCoordinates]
		} as GeoJSONGeometry,
		topo: { site: '', link: '' },
		assets: { topos: [], images: [], models: [], approaches: [] }
	};
}

export function addSector(sectors: CragSector[] = [], sector: CragSector): CragSector[] {
	return [...sectors, sector];
}

export function duplicateSectorById(
	sectors: CragSector[] = [],
	id: string
): { sectors: CragSector[]; duplicatedId: string | null } {
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
				...(JSON.parse(JSON.stringify(source)) as CragSector),
				id: uniqueId,
				name: `${source.name || source.id} Copy`
			}
		]
	};
}

export function removeSectorById(sectors: CragSector[] = [], id: string): CragSector[] {
	return sectors.filter((sector) => sector.id !== id);
}


type EquipmentItem = {
	name: string;
	amount: number;
	[key: string]: unknown;
};

export function addEquipment(
	equipment: unknown[] = [],
	item: EquipmentItem = { name: 'Expressschlingen', amount: 12 }
): unknown[] {
	return [...equipment, item];
}

export function removeEquipment<T>(equipment: T[] = [], index: number): T[] {
	return equipment.filter((_, i) => i !== index);
}

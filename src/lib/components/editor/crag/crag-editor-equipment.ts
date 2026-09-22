type EquipmentItem = {
	name: string;
	amount: number;
	[key: string]: unknown;
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

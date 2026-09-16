export type ApiListEntry = {
	name: string;
	path: string;
	type: 'file' | 'dir';
};

export type ApiListOptions = {
	recursive?: boolean;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

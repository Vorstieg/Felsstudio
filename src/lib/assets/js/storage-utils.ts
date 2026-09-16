export const storage = {
	set(key: string, value: unknown): boolean {
		try {
			if (typeof window === 'undefined') return false;
			const data = JSON.stringify(value);
			window.localStorage.setItem(key, data);
			return true;
		} catch (e) {
			console.error('Storage Error (set):', e);
			return false;
		}
	},

	get<T = unknown>(key: string, defaultValue: T | null = null): T | null {
		try {
			if (typeof window === 'undefined') return defaultValue;
			const data = window.localStorage.getItem(key);
			if (!data) return defaultValue;
			return JSON.parse(data) as T;
		} catch (e) {
			console.error('Storage Error (get):', e);
			return defaultValue;
		}
	},

	remove(key: string): void {
		try {
			if (typeof window === 'undefined') return;
			window.localStorage.removeItem(key);
		} catch (e) {
			console.error('Storage Error (remove):', e);
		}
	}
};

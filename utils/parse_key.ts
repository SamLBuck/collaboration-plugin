export function parseShareKey(shareKey: string): { ip: string; port: number; key: string } {
	const match = shareKey.match(/^obs-collab:\/\/([\d.]+|localhost):(\d+)\/note\/(.+)$/);
	if (!match) throw new Error("Invalid share key format");
	return {
		ip: match[1],
		port: parseInt(match[2]),
		key: match[3],
	};
}

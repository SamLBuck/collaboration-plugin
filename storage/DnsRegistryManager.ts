import * as https from 'https';
import { URL } from 'url';
const DDNS_DOMAIN = "obsidiancollaborationplugin.com";
const DDNS_PASSWORD = "password";

export async function updateSubdomain(subdomain: string, domain: string, ddnsPassword: string, ip?: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const queryUrl = new URL('https://dynamicdns.park-your-domain.com/update');
		queryUrl.searchParams.set('host', subdomain);
		queryUrl.searchParams.set('domain', domain);
		queryUrl.searchParams.set('password', ddnsPassword);
		if (ip) queryUrl.searchParams.set('ip', ip);

		https.get(queryUrl, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				console.log(`[DDNS] Response: ${data}`);
				resolve(data.includes("<ErrCount>0</ErrCount>"));
			});
		}).on('error', (err) => {
			console.error(`[DDNS] Request failed:`, err);
			reject(false);
		});
	});
}

export async function resolveIp(subdomain: string, domain: string): Promise<string | null> {
	try {
		const dns = await import('dns').then(mod => mod.promises);
		const result = await dns.lookup(`${subdomain}.${domain}`);
		return result.address;
	} catch (err) {
		console.error(`[DNS] Failed to resolve ${subdomain}.${domain}`, err);
		return null;
	}
}

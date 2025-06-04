import MyPlugin, { KeyItem } from "../main";
import { updateSubdomain } from "../storage/DnsRegistryManager";
import { addKey, generateKey } from "../storage/keyManager";
import { DDNS_DOMAIN } from "../constants";

export async function generateAndRegisterKey(plugin: MyPlugin, noteName: string, access: string): Promise<KeyItem> {
	const keyItem = await generateKey(plugin, noteName, access);

	const subdomain = plugin.settings.myPeerId || "peer1"; // use configured peer ID
	const fqdn = `${subdomain}.${DDNS_DOMAIN}`;

	// Override the old IP-like value with the DDNS hostname
	keyItem.ip = `${fqdn}-${noteName}|${access}`;

	await updateSubdomain(subdomain, DDNS_DOMAIN, plugin.settings.ddnsPassword);
	await addKey(plugin, keyItem);

	console.log(`[KeyGen] Generated key for ${noteName}:`, keyItem);
	console.log(`[DDNS] Updating DNS for ${fqdn}`);

	return keyItem;
}

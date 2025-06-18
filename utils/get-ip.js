import * as os from "os";

export function getLocalIP() {
	const interfaces = os.networkInterfaces();
	const ignored = ["Loopback", "vEthernet", "VirtualBox", "VMware", "Bluetooth"];

	for (const name of Object.keys(interfaces)) {
		if (ignored.some(prefix => name.startsWith(prefix))) continue;

		for (const iface of interfaces[name] || []) {
			if (iface.family === "IPv4" && !iface.internal) {
				return iface.address;
			}
		}
	}

	return "127.0.0.1"; // fallback
}

import os from 'os';

export function getLocalIP() {
  const interfaces = os.networkInterfaces();

  // 1) Try to grab Wi-Fi first (Windows: “Wi-Fi” / macOS: “en0” sometimes)
  const wifiIfaces = Object.keys(interfaces)
    .filter(name => /wi[-]?fi|wireless/i.test(name));

  for (const name of wifiIfaces) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  // 2) Otherwise, your original “first non-internal IPv4 on any non-ignored iface”
  const ignored = ['Loopback', 'vEthernet', 'VirtualBox', 'VMware', 'Bluetooth'];

  for (const name of Object.keys(interfaces)) {
    if (ignored.some(prefix => name.startsWith(prefix))) continue;

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}

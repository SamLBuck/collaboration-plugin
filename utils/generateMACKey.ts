import { networkInterfaces } from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

import MyPlugin, { KeyItem } from "../main"; // Adjust the import path as necessary
import { requestNoteFromPeer } from "../networking/socket/client";
/**
 * Gets the first non-internal IPv4 address
 */
function getLocalIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Uses arp to get the MAC address associated with the given IP
 */
async function getMacForIp(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`arp -a ${ip}`);
    const match = stdout.match(/([0-9a-fA-F]{2}[-:]){5}[0-9a-fA-F]{2}/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

async function generateMACKey(plugin: MyPlugin, noteName: string, accessType: string): Promise<KeyItem> {
    const nets = networkInterfaces();
    let mac: string | null = null;

    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal && net.mac !== "00:00:00:00:00:00") {
                mac = net.mac;
                break;
            }
        }
        if (mac) break;
    }

    if (!mac) {
        throw new Error("Could not find a valid MAC address.");
    }

    const normalizedMac = normalizeMac(mac)
    const sanitizedNoteName = noteName.replace(/\s/g, "_");
    const newKeyId = `${normalizedMac}::${sanitizedNoteName}|${accessType}`;

    return {
        ip: newKeyId,           // still using `ip` field to store the generated key
        macAddress: mac,        // include actual MAC for display/resolution
        note: noteName,
        access: accessType
    };
}
function normalizeMac(mac: string): string {
    return mac.toLowerCase().replace(/[^a-f0-9]/gi, "").match(/.{1,2}/g)?.join("-") ?? "";
  }

function findIpForMac(macAddress: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      exec("arp -a", (error, stdout) => {
        if (error) return reject(`ARP command failed: ${error}`);
  
        const normalizedTargetMac = normalizeMac(macAddress);
        const lines = stdout.split("\n");
  
        for (const line of lines) {
          const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3})\s+([\da-fA-F:-]{17})/);
          if (match) {
            const [_, ip, mac] = match;
            if (normalizeMac(mac) === normalizedTargetMac) {
              return resolve(ip);
            }
          }
        }
  
        resolve(null);
      });
    });
  }
  async function pullNoteByKey(key: string): Promise<string | null> {
    const macHash = key.split("::")[0];
    const ip = await findIpForMac(macHash);
    if (!ip) {
      console.warn(`[Client] Failed to resolve IP for MAC hash: ${macHash}`);
      return null;
    }
  
    const wsUrl = `ws://${ip}:3010`;
  
    try {
      const content = await requestNoteFromPeer(wsUrl, key);
      return content;
    } catch (err) {
      console.error(`[Client] Failed to fetch note from ${wsUrl}:`, err);
      return null;
    }
}
  
export { generateMACKey, getMacForIp, normalizeMac, getLocalIp, findIpForMac, pullNoteByKey };


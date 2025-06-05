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
        if (error) {
          console.error("ARP command failed:", error);
          return reject(`ARP command failed: ${error}`);
        }
  
        console.log("=== arp -a output ===");
        const lines = stdout.split("\n");
        for (const line of lines) {
          console.log(line);
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const ip = parts[0];
            const mac = parts[1];
            if (mac.toLowerCase() === macAddress.toLowerCase()) {
              console.log(`[MATCH] Found IP ${ip} for MAC ${mac}`);
              return resolve(ip);
            }
          }
        }
  
        console.warn(`[MISS] MAC ${macAddress} not found in ARP table`);
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


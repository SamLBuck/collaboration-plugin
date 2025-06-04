// src/utils/updateCloudflareDNS.ts

export async function getPublicIP(): Promise<string> {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip;
  }
  
  export async function updateCloudflareDNS({
    zoneId,
    apiToken,
    subdomain,
    ip,
    rootDomain
  }: {
    zoneId: string;
    apiToken: string;
    subdomain: string;
    ip: string;
    rootDomain: string;
  }): Promise<void> {
    const fullDomain = `${subdomain}.${rootDomain}`;
  
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "A",
        name: fullDomain,
        content: ip,
        ttl: 120,
        proxied: false
      })
    });
  
    const json = await res.json();
  
    if (!json.success) {
      console.error("Failed to create DNS record:", json.errors);
      throw new Error("Cloudflare DNS update failed.");
    } else {
      console.log(`Subdomain created: ${fullDomain} → ${ip}`);
    }
  }
  
// src/utils/api.ts

/**
 * Fetches the master note content for a given noteKey.
 * @param apiBaseUrl - Base URL of the API Gateway (e.g., https://xyz.execute-api.us-east-1.amazonaws.com)
 * @param noteKey - The shared identifier for the note
 * @param apiKey - The x-api-key header value for authentication
 * @returns The master note content as a string
 */
export async function fetchMaster(
    apiBaseUrl: string,
    noteKey: string,
    apiKey: string
  ): Promise<string> {
    const url = `${apiBaseUrl.replace(/\/*$/, '')}/notes/${encodeURIComponent(noteKey)}/master`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch master: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    return payload.content ?? '';
  }
  /**
 * Write a test record into DynamoDB via our new endpoint.
 */
export async function testWrite(
  apiBaseUrl: string,
  noteKey: string,
  apiKey: string,
  content: string
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/+$/,'')}/test`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({ noteKey, content })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(()=>resp.statusText);
    throw new Error(`testWrite failed: ${resp.status} ${text}`);
  }
}

  /**
   * Pushes an offer/update for a collaborator's note.
   * @param apiBaseUrl - Base URL of the API Gateway
   * @param noteKey - The shared identifier for the note
   * @param apiKey - The x-api-key header value
   * @param collabId - Unique identifier for the collaborator
   * @param content - The full markdown content to offer
   */
  export async function pushOffer(
    apiBaseUrl: string,
    noteKey: string,
    apiKey: string,
    collabId: string,
    content: string
  ): Promise<void> {
    const url = `${apiBaseUrl.replace(/\/*$/, '')}/notes/${encodeURIComponent(noteKey)}/offer/${encodeURIComponent(collabId)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      throw new Error(`Failed to push offer: ${response.status} ${response.statusText}`);
    }
  }
  
  /**
   * Resolves the master note by submitting merged content and rotating permissions.
   * @param apiBaseUrl - Base URL of the API Gateway
   * @param noteKey - The shared identifier for the note
   * @param apiKey - The x-api-key header value
   * @param collabId - Unique identifier for the resolver
   * @param mergedContent - The merged markdown content to set as new master
   */
  export async function resolveMaster(
    apiBaseUrl: string,
    noteKey: string,
    apiKey: string,
    collabId: string,
    mergedContent: string
  ): Promise<void> {
    const url = `${apiBaseUrl.replace(/\/*$/, '')}/notes/${encodeURIComponent(noteKey)}/resolve`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ mergedContent, resolverId: collabId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to resolve master: ${response.status} ${response.statusText}`);
    }
  }

  /**
 * Create a new collaboration note and receive its access credentials. 
 */
export async function createNote(
  apiBaseUrl: string,
  collabId: string
): Promise<{noteKey: string, apiKey: string}> {
  const resp = await fetch(`${apiBaseUrl.replace(/\/+$/,'')}/notes`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ resolverId: collabId })
  });
  if (!resp.ok) throw new Error(`CreateNote failed: ${resp.statusText}`);
  return resp.json();
}

  
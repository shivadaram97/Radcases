/**
 * Client-Side GitHub Contents Sync API.
 * Interacts with the GitHub API v3 directly to fetch and commit `data.json`.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  filePath: string;
}

/**
 * Robust Base64 encoding supporting Unicode strings safely.
 */
export function utf8ToBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (error) {
    // Fallback using modern TextEncoder if necessary
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/**
 * Robust Base64 decoding supporting Unicode strings safely.
 */
export function base64ToUtf8(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch (error) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
}

/**
 * Fetches the metadata and SHA of data.json from GitHub if it exists.
 * Returns null if the file does not exist yet (useful for initial creation).
 */
async function fetchFileSHA(config: GitHubConfig): Promise<string | null> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Cache-Control': 'no-cache'
    }
  });

  if (response.status === 404) {
    return null; // File does not exist yet
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Failed to query repository information (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data.sha || null;
}

/**
 * Updates or creates the data.json in the user's GitHub Repository.
 */
export async function syncToGitHub(config: GitHubConfig, dataContent: string): Promise<{ sha: string }> {
  const fileSha = await fetchFileSHA(config);
  const base64Content = utf8ToBase64(dataContent);
  
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}`;
  
  const payload = {
    message: 'sync: update radiopaedia case collection data.json',
    content: base64Content,
    sha: fileSha || undefined // Include SHA only if the file already exists
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `GitHub Sync update failed (HTTP ${response.status})`);
  }

  const responseData = await response.json();
  return { sha: responseData.content.sha };
}

/**
 * Imports/Pulls data.json from GitHub into local memory.
 */
export async function fetchFromGitHub(config: GitHubConfig): Promise<string> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File '${config.filePath}' was not found in the repository yet.`);
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch data from GitHub (HTTP ${response.status})`);
  }

  const responseData = await response.json();
  if (!responseData.content) {
    throw new Error('No content field in GitHub payload.');
  }
  
  // Clean newlines/whitespace from base64 content
  const cleanBase64 = responseData.content.replace(/\s/g, '');
  return base64ToUtf8(cleanBase64);
}

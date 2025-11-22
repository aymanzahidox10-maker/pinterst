import { GitHubConfig } from '../types';

export const uploadImageToGitHub = async (
  config: GitHubConfig,
  filename: string,
  base64Content: string
): Promise<string> => {
  const cleanBase64 = base64Content.replace(/^data:image\/\w+;base64,/, '');
  
  const path = `pins/${filename}`;
  const url = `https://api.github.com/repos/${config.username}/${config.repo}/contents/${path}`;

  const body = {
    message: `Add pin: ${filename}`,
    content: cleanBase64,
  };

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'GitHub upload failed');
    }

    const data = await response.json();
    // Return the download URL (raw content)
    return data.content.download_url;
  } catch (error: any) {
    console.error('GitHub Upload Error:', error);
    throw error;
  }
};

export const verifyGitHubConnection = async (config: GitHubConfig): Promise<boolean> => {
  const url = `https://api.github.com/repos/${config.username}/${config.repo}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    return response.ok;
  } catch (e) {
    return false;
  }
};
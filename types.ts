export interface GitHubConfig {
  username: string;
  repo: string;
  token: string;
}

export interface BannerStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  textBorderColor: string; // Used for text stroke/outline
  textBorderWidth: number;
  fontFamily: string;
}

export interface PinConfig {
  links: string;
  topPrompt: string;
  bottomPrompt: string;
  aspectRatio: '2:3' | '1:2';
  startDate: string; // ISO string
}

export interface PinData {
  id: string;
  link: string;
  status: 'idle' | 'analyzing' | 'generating_images' | 'composing' | 'ready' | 'uploading' | 'done' | 'error';
  
  // AI Generated / Extracted Data
  keyword: string;
  title: string;
  description: string;
  seoKeywords: string; // comma separated
  
  // Images
  topImageBase64?: string;
  bottomImageBase64?: string;
  finalPinBase64?: string; // The composed image
  
  // Upload Data
  githubUrl?: string;
  publishDate?: string;
  
  errorMsg?: string;
}

export const DEFAULT_BANNER: BannerStyle = {
  backgroundColor: '#60208d',
  borderColor: '#f4b317',
  textColor: '#ffffff',
  textBorderColor: '#000000',
  textBorderWidth: 3,
  fontFamily: 'Playfair Display',
};
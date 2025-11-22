import { GoogleGenAI, Type } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// 1. Analyze Link to extract Metadata
export const analyzeLink = async (link: string) => {
  const ai = getClient();
  
  const prompt = `
    Analyze this URL: ${link}
    
    I need to create a Pinterest Pin for this content. 
    Infer the content from the URL structure or if it's a known domain.
    
    Return a JSON object with:
    - "keyword": A short, punchy 2-4 word phrase suitable for a banner text on the image (e.g. "Best Lasagna", "Keto Cookies").
    - "title": An SEO optimized Pinterest Title (max 100 chars).
    - "description": An SEO optimized Pinterest Description (max 300 chars).
    - "seoKeywords": A string of 5-10 comma-separated related keywords.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keyword: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            seoKeywords: { type: Type.STRING },
          },
          required: ['keyword', 'title', 'description', 'seoKeywords']
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("AI Analysis Error:", e);
    // Fallback if AI fails
    return {
      keyword: "New Recipe",
      title: "Delicious Recipe Idea",
      description: "Check out this amazing recipe found at the link!",
      seoKeywords: "recipe, food, cooking"
    };
  }
};

// 2. Generate Image Section (Top or Bottom)
export const generateImageSection = async (prompt: string, contextKeyword: string) => {
  const ai = getClient();
  
  const fullPrompt = `A realistic, high-quality, professional food photography shot. 
  Subject: ${prompt}. 
  Context: This is for a recipe pin about "${contextKeyword}".
  Style: Bright, appetizing, high resolution, photorealistic.
  Perspective: Top-down or 45-degree angle. No text overlay.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: fullPrompt,
      config: {
        imageConfig: {
          aspectRatio: "1:1", // Generate square, we will crop/fit in canvas
          imageSize: "1K"
        }
      }
    });

    // Find image part
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data generated");
  } catch (e) {
    console.error("Image Gen Error:", e);
    // Return a placeholder if generation fails to avoid crashing flow
    return "https://picsum.photos/1000/1000"; 
  }
};
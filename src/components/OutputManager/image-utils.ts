import { logger } from "@/lib/logger";
/**
 * Converts image data (URL or base64) to a Blob
 */
export const imageDataToBlob = async (
  imageUrl?: string,
  imageBase64?: string
): Promise<Blob | null> => {
  try {
    if (imageBase64) {
      // Handle base64 data URL
      const response = await fetch(imageBase64);
      return await response.blob();
    }
    
    if (imageUrl) {
      // Fetch image from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }
      return await response.blob();
    }
    
    return null;
  } catch (error) {
    logger.error('Error converting image to blob:', error);
    return null;
  }
};

/**
 * Downloads an image file
 */
export const downloadImage = async (
  imageUrl?: string,
  imageBase64?: string,
  filename: string = 'featured-image.png'
): Promise<void> => {
  try {
    const blob = await imageDataToBlob(imageUrl, imageBase64);
    if (!blob) {
      throw new Error('No image data available');
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    logger.error('Error downloading image:', error);
    throw error;
  }
};

/**
 * Copies an image to the clipboard
 */
export const copyImageToClipboard = async (
  imageUrl?: string,
  imageBase64?: string
): Promise<void> => {
  try {
    const blob = await imageDataToBlob(imageUrl, imageBase64);
    if (!blob) {
      throw new Error('No image data available');
    }
    
    // Use Clipboard API to copy image
    if (navigator.clipboard && navigator.clipboard.write) {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
    } else {
      throw new Error('Clipboard API not available');
    }
  } catch (error) {
    logger.error('Error copying image to clipboard:', error);
    throw error;
  }
};



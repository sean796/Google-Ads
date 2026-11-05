import React, { useState, useEffect } from "react";
import type { ImageType } from "@/lib/image-section-analyzer";
import { SelectField, TextareaField } from "@/ui";

interface InContentImageGeneratorProps {
  imageType?: ImageType | '';
  userPrompt?: string;
  onImageTypeChange: (imageType: ImageType | '') => void;
  onUserPromptChange: (userPrompt: string) => void;
  disabled?: boolean;
}

export const InContentImageGenerator: React.FC<InContentImageGeneratorProps> = ({
  imageType: propImageType = '',
  userPrompt: propUserPrompt = '',
  onImageTypeChange,
  onUserPromptChange,
  disabled = false,
}) => {
  const [imageType, setImageType] = useState<ImageType | ''>(propImageType);
  const [userPrompt, setUserPrompt] = useState(propUserPrompt);

  // Sync with props
  useEffect(() => {
    setImageType(propImageType);
  }, [propImageType]);

  useEffect(() => {
    setUserPrompt(propUserPrompt);
  }, [propUserPrompt]);

  const handleImageTypeChange = (value: string) => {
    // Convert "__none__" special value to empty string for clearing
    if (value === '__none__') {
      setImageType('');
      onImageTypeChange('');
      return;
    }
    const newType = value as ImageType;
    setImageType(newType);
    onImageTypeChange(newType);
  };

  const handleUserPromptChange = (value: string) => {
    setUserPrompt(value);
    onUserPromptChange(value);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <SelectField placeholder="In Content Image" value={imageType || '__none__'} onValueChange={handleImageTypeChange} disabled={disabled} options={[{ value: "__none__", label: "In Content Image" }, { value: "infographic", label: "Infographic" }, { value: "blog-image", label: "Blog Image" }, { value: "diagram", label: "Diagram" }, { value: "illustration", label: "Illustration" }, { value: "chart", label: "Chart" }, { value: "photo", label: "Photo" }, { value: "custom", label: "Custom" }]} />
        {imageType === 'infographic' && (
          <p className="text-xs text-muted-foreground">
            Infographics are optimized for mobile displays (tall format)
          </p>
        )}
      </div>

      {imageType && (
        <div className="space-y-2">
          <label htmlFor="image-prompt" className="text-sm font-medium text-foreground">
            Optional Prompt Modifier
          </label>
          <TextareaField
            id="image-prompt"
            placeholder="Describe any specific requirements for the image (e.g., 'modern and colorful', 'include data visualization')..."
            value={userPrompt}
            onChange={(e) => handleUserPromptChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
};


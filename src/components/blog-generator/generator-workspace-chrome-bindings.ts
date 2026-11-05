import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

export type GeneratorWorkspaceChromeBindings = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
};

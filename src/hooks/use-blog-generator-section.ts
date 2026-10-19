import { useEffect, useState } from "react";
import {
  readStoredBlogGeneratorSection,
  registerBlogGeneratorSectionListener,
  unregisterBlogGeneratorSectionListener,
  type BlogGeneratorSectionId,
} from "@/components/blog-generator/blog-generator-sections";

/** Reactive sessionStorage section for mega menu highlighting. */
export function useBlogGeneratorSection(): BlogGeneratorSectionId {
  const [section, setSection] = useState<BlogGeneratorSectionId>(() => readStoredBlogGeneratorSection());

  useEffect(() => {
    const onChange = (id: BlogGeneratorSectionId) => setSection(id);
    registerBlogGeneratorSectionListener(onChange);
    return () => unregisterBlogGeneratorSectionListener(onChange);
  }, []);

  return section;
}

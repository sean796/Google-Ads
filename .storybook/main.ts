import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const config: StorybookConfig = {
  stories: ["../src/ui/**/*.stories.tsx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    viteConfig.resolve = viteConfig.resolve ?? {};
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias as Record<string, string> | undefined),
      "@": join(rootDir, "src"),
    };
    return viteConfig;
  },
};

export default config;

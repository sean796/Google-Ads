import type { Preview } from "@storybook/react";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#09090b" }],
    },
  },
};

export default preview;

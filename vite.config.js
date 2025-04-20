// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Mode-specific configurations (hardcoded instead of reading from env files)
  const channelId =
    mode === "aitmir" ? "aitmir" : mode === "blogem" ? "blogem" : "wowmind";

  // Channel-specific configurations
  let channelConfig;
  if (channelId === "wowmind") {
    channelConfig = {
      outDir: "dist/wowmind",
      title: "WowMind Tag Cloud",
    };
  } else if (channelId === "aitmir") {
    channelConfig = {
      outDir: "dist/aitmir",
      title: "AI IT Tag Cloud",
    };
  } else if (channelId === "blogem") {
    channelConfig = {
      outDir: "dist/blogem",
      title: "Blogem Tag Cloud",
    };
  } else {
    channelConfig = {
      outDir: "dist",
      title: "Tag Cloud",
    };
  }

  return {
    plugins: [react()],
    base: "/tagcloud/", // For GitHub Pages deployment
    // base: "/apps/tagcloud/", // For GitHub Pages deployment
    build: {
      outDir: channelConfig.outDir,
    },
    define: {
      // Inject the channel ID as an environment variable
      "import.meta.env.VITE_CHANNEL_ID": JSON.stringify(channelId),
    },
  };
});

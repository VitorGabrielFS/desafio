import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { sites } from "./build/sites-vite-plugin";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [vinext(), sites()],
    server: { host: "127.0.0.1" },
  };
});

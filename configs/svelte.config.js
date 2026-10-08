import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true,
        warningFilter: (warning) => !warning.code.startsWith("a11y_")
    }
};
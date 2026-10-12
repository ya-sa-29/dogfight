import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
    {
        files: ["**/*.js"],
        ignores: ["node_modules/**", "dist/**"],
        languageOptions: {
            globals: globals.browser,
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error",
        },
    },
]);

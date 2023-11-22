import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsdocPlugin from "eslint-plugin-jsdoc";
import prettierPlugin from "eslint-plugin-prettier";

/** @type {import('eslint').Linter.FlatConfig} */
const config = [
  {
    files: ["**/*.js"],
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
      jsdoc: jsdocPlugin,
    },
    rules: {
      ...jsdocPlugin.configs["flat/recommended"].rules,
      ...prettierConfig.rules,
      ...prettierPlugin.configs.recommended.rules,
      "import/namespace": "off",
      "import/order": [
        "error",
        {
          alphabetize: {
            caseInsensitive: true,
            order: "asc",
          },
          "newlines-between": "always",
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { modules: true },
        ecmaVersion: "latest",
        project: "tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      prettier: prettierPlugin,
      jsdoc: jsdocPlugin,
    },
    settings: {
      "import/resolver": {
        node: true,
        typescript: true,
      },
    },
    rules: {
      ...tsPlugin.configs["eslint-recommended"].rules,
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      ...jsdocPlugin.configs["flat/recommended-typescript"].rules,
      ...prettierConfig.rules,
      ...prettierPlugin.configs.recommended.rules,
      "import/namespace": "off",
      "import/order": [
        "error",
        {
          alphabetize: {
            caseInsensitive: true,
            order: "asc",
          },
          "newlines-between": "always",
        },
      ],
    },
  },
];

export default config;

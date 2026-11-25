import { defineWorkspace } from "vitest/workspace";

export default defineWorkspace([
  {
    name: "shared",
    root: "shared",
    test: {
      include: ["test/**/*.test.ts"],
      alias: {
        "@dogfight/shared": "/E:/Files/dogfight/shared/index.ts",
      },
    },
  },
  {
    name: "server",
    root: "server",
    test: {
      include: ["test/**/*.test.ts"],
      alias: {
        "@dogfight/shared": "/E:/Files/dogfight/shared/index.ts",
      },
    },
  },
  {
    name: "client",
    root: "client",
    test: {
      include: ["test/**/*.test.ts"],
      alias: {
        "@dogfight/shared": "/E:/Files/dogfight/shared/index.ts",
      },
    },
  },
]);

// ESM loader hook that resolves the "@/*" -> "./src/*" path alias declared
// in tsconfig.json's `compilerOptions.paths`. Vite (via vite-tsconfig-paths)
// and `tsc` already understand this alias; Node's own module resolver does
// not. Without this hook, any test reached by `node --test` that transitively
// imports a "@/..." specifier fails with ERR_MODULE_NOT_FOUND even though the
// same code builds and typechecks cleanly.
//
// Registered via scripts/register-alias-loader.mjs (see package.json "test").
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".jsx"];

function resolveWithExtensions(basePath) {
  if (existsSync(basePath)) {
    const stat = statSync(basePath);
    if (stat.isFile()) return basePath;
    if (stat.isDirectory()) {
      for (const ext of EXTENSIONS) {
        const indexPath = path.join(basePath, `index${ext}`);
        if (existsSync(indexPath)) return indexPath;
      }
    }
    return null;
  }
  for (const ext of EXTENSIONS) {
    const withExt = basePath + ext;
    if (existsSync(withExt)) return withExt;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const basePath = path.join(srcRoot, specifier.slice(2));
    const resolved = resolveWithExtensions(basePath);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  // The codebase's TypeScript config uses "moduleResolution": "bundler",
  // which (like Vite/webpack) allows extensionless relative specifiers
  // (e.g. "./catalog"). Node's own ESM resolver requires an explicit
  // extension, so probe for one here before falling through.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL &&
    !path.extname(specifier)
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const basePath = path.join(parentDir, specifier);
    const resolved = resolveWithExtensions(basePath);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  return nextResolve(specifier, context);
}

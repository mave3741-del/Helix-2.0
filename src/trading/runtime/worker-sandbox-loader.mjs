import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, relative, sep } from 'node:path';

const root = resolvePath(process.env.HELIX_SANDBOX_ROOT ?? process.cwd());

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function insideRoot(pathname) {
  const rel = relative(root, resolvePath(pathname));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
}

/**
 * @param {string} specifier
 * @param {{ parentURL?: string, conditions?: string[] }} context
 * @param {(specifier: string, context: unknown) => Promise<{ url: string, [key: string]: unknown }>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.startsWith('node:')) throw new Error(`sandbox_builtin_module_denied:${specifier}`);
  if (result.url.startsWith('data:') || result.url.startsWith('http:') || result.url.startsWith('https:')) {
    throw new Error(`sandbox_module_protocol_denied:${result.url.split(':')[0]}`);
  }
  if (result.url.startsWith('file:') && !insideRoot(fileURLToPath(result.url))) {
    throw new Error('sandbox_module_path_denied');
  }
  return result;
}

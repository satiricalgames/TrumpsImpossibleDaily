export const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function publicPath(path: string) {
  if (!path.startsWith('/')) return path;
  return `${PUBLIC_BASE_PATH}${path}`;
}

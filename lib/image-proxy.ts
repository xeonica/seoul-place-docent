export const IMAGE_RESOURCE_DOMAINS = [
  'https://museum.seoul.go.kr:8088',
  'https://museum.seoul.go.kr',
  'https://archive-file.sb.go.kr',
  'https://archive.much.go.kr',
  'https://archives.seoul.go.kr',
  'https://archives-files.seoul.go.kr',
  'https://data.si.re.kr',
] as const;

const allowedOrigins = new Set<string>(IMAGE_RESOURCE_DOMAINS);

export function isAllowedImageUrl(value: string): boolean {
  const url = URL.parse(value);
  return !!url && url.protocol === 'https:' && !url.username && !url.password
    && allowedOrigins.has(url.origin);
}

export function toProxyUrl(origin: string, original: string): string {
  return `${origin}/img?u=${encodeURIComponent(original)}`;
}

export function imageProxyOrigin(): string {
  return URL.parse(process.env.PUBLIC_BASE_URL ?? '')?.origin
    ?? 'https://seoul-place-docent-mcp.vercel.app';
}

/** Archive sites check that image requests come from their own viewer pages. */
const refererByHost: Record<string, string> = {
  'museum.seoul.go.kr': 'https://museum.seoul.go.kr/',
  'archive-file.sb.go.kr': 'https://archive.sb.go.kr/',
  'archives-files.seoul.go.kr': 'https://archives.seoul.go.kr/',
};

export function upstreamReferer(original: string): string {
  const url = new URL(original);
  return refererByHost[url.hostname] ?? `${url.origin}/`;
}

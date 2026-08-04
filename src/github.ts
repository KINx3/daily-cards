/** GitHub Actions 환경에서 커밋된 파일의 공개 raw URL 계산 */
export function rawUrl(repoPath: string): string {
  const repo = requireEnv("GITHUB_REPOSITORY"); // "owner/repo"
  const branch = process.env.GITHUB_REF_NAME ?? "main";
  return `https://raw.githubusercontent.com/${repo}/${branch}/${repoPath}`;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name}이(가) 필요합니다.`);
  return v;
}

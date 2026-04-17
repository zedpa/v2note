/**
 * GitHub API 轻量封装 — 仅用于 Issue 创建
 * 需要 GITHUB_TOKEN 和 GITHUB_REPO 环境变量
 */

interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
}

interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
}

/**
 * 创建 GitHub Issue
 * @returns 创建的 Issue 信息，或 null（如果 token 未配置）
 */
export async function createGitHubIssue(params: CreateIssueParams): Promise<GitHubIssue | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "gf-pldi/v2note";

  if (!token) {
    console.warn("[github] GITHUB_TOKEN not set, skipping issue creation");
    return null;
  }

  const url = `https://api.github.com/repos/${repo}/issues`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "v2note-gateway",
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: params.labels ?? [],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[github] Failed to create issue: ${response.status} ${errorText}`);
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as any;
  console.log(`[github] Issue created: #${data.number} - ${data.title}`);

  return {
    number: data.number,
    html_url: data.html_url,
    title: data.title,
  };
}

/**
 * 为已有 Issue 添加评论
 */
export async function addIssueComment(issueNumber: number, body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "gf-pldi/v2note";

  if (!token) return;

  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "v2note-gateway",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    console.error(`[github] Failed to add comment to #${issueNumber}: ${response.status}`);
  }
}

/**
 * System prompt for cluster validation via AI.
 */

export function buildClusteringPrompt(): string {
  return `你是认知聚类引擎。以下是一组高度关联的认知记录（Strike）。判断它们是否构成一个有意义的主题聚类。

如果构成聚类：{"valid":true,"name":"2-8个字","description":"一句话描述","polarity":"最主要的极性"}
如果太散太泛：{"valid":false}

返回纯JSON。`;
}

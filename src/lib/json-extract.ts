/**
 * 从模型输出的自由文本中提取 JSON 片段。
 *
 * 优先级：
 * 1. 三个反引号围栏 ```json ... ```
 * 2. 首个 `{` 起的平衡括号片段（字符串感知，忽略引号中的花括号）
 * 3. 原文 trim 后返回
 */
export function extractJsonBlock(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = text.indexOf("{");
  if (start < 0) {
    return text.trim();
  }

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return text.trim();
}

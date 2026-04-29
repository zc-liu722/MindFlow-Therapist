function unescapeMarkdown(value: string) {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!>~])/g, "$1");
}

function stripInlineMarkdownSyntax(value: string) {
  return unescapeMarkdown(value)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1");
}

export function cleanInlineMarkdown(value: string) {
  return stripInlineMarkdownSyntax(value).trim();
}

export function cleanMarkdownText(value: string) {
  return stripInlineMarkdownSyntax(value)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/\r/g, "")
    .trim();
}

export function normalizeThinkingText(value: string) {
  return cleanMarkdownText(value)
    .replace(/[#>*`~_-]+/g, " ")
    .replace(/^[\s\-*+\d.、（）()]+/gm, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

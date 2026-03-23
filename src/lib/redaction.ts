const piiPatterns = [
  /\b1\d{10}\b/g,
  /\b\d{15,18}[\dXx]?\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b\d{3,4}-\d{6,8}\b/g
];

export function redactSensitiveText(input: string): string {
  let output = input;

  piiPatterns.forEach((pattern) => {
    output = output.replace(pattern, "[已脱敏]");
  });

  return output
    .replace(/我叫[\u4e00-\u9fa5A-Za-z]{2,8}/g, "我叫[已脱敏]")
    .replace(/住在[\u4e00-\u9fa5A-Za-z0-9]{2,20}/g, "住在[已脱敏]")
    .replace(/在[\u4e00-\u9fa5A-Za-z]{2,20}(公司|学校|医院)/g, "在[已脱敏机构]");
}

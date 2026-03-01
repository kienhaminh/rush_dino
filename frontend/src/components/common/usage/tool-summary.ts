export function parseToolSummary(content: string) {
  const lines = content.split("\n");
  const toolCounts = new Map<string, number>();
  const nonToolLines: string[] = [];
  for (const line of lines) {
    const match = /^\[Tool:\s*([^\]]+)\]/.exec(line.trim());
    if (match) {
      const name = match[1];
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
      continue;
    }
    if (line.trim().startsWith("[Tool Result]")) {
      continue;
    }
    nonToolLines.push(line);
  }
  const sortedTools = Array.from(toolCounts.entries()).toSorted(
    (a, b) => b[1] - a[1],
  );
  const totalCalls = sortedTools.reduce((sum, [, count]) => sum + count, 0);
  const summary =
    sortedTools.length > 0
      ? `Tools: ${sortedTools
          .map(([name, count]) => `${name}×${count}`)
          .join(", ")} (${totalCalls} calls)`
      : "";
  return {
    tools: sortedTools,
    summary,
    cleanContent: nonToolLines.join("\n").trim(),
  };
}

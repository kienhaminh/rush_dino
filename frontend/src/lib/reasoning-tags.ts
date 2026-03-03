export type StripReasoningTagsMode = "preserve" | "remove";

export type StripReasoningTagsTrim = "none" | "start" | "end" | "both";

export type StripReasoningTagsOptions = {
  mode?: StripReasoningTagsMode;
  trim?: StripReasoningTagsTrim;
};

function stripThinkingSections(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
}

function stripFinalWrapper(text: string): string {
  return text.replace(/<final>([\s\S]*?)<\/final>/gi, "$1");
}

function stripOrphanTags(text: string): string {
  return text
    .replace(/<\/?think>/gi, "")
    .replace(/<\/?thinking>/gi, "")
    .replace(/<\/?final>/gi, "");
}

export function stripReasoningTagsFromText(
  value: unknown,
  options: StripReasoningTagsOptions = {},
): string {
  const mode = options.mode ?? "preserve";
  const trim = options.trim ?? "none";

  let output = String(value ?? "");
  output = stripThinkingSections(output);
  output = stripFinalWrapper(output);
  output = stripOrphanTags(output);

  if (mode === "remove") {
    output = output.replace(/\s{3,}/g, "\n\n");
  }

  if (trim === "start") {
    output = output.trimStart();
  } else if (trim === "end") {
    output = output.trimEnd();
  } else if (trim === "both") {
    output = output.trim();
  }

  return output;
}

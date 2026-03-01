import fs from "node:fs";
import path from "node:path";

const commonRoot = path.resolve(process.cwd(), "src/components/common");

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(next));
      continue;
    }
    if (entry.isFile() && next.endsWith(".ts")) {
      files.push(next);
    }
  }
  return files;
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const missing = [];
const files = collectFiles(commonRoot);
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.matchAll(/from\s+["'](\.[^"']+)["']/g);
  for (const match of matches) {
    const specifier = match[1];
    if (!resolveRelativeImport(file, specifier)) {
      missing.push({ file, specifier });
    }
  }
}

if (missing.length > 0) {
  console.error("Missing relative imports in src/components/common:");
  for (const item of missing) {
    console.error(`- ${path.relative(process.cwd(), item.file)} -> ${item.specifier}`);
  }
  process.exit(1);
}

console.log(`Checked ${files.length} files. All relative imports are resolvable.`);

function unquoteTomlValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return trimmed;
}

function parsePlusToml(text) {
  const repositories = [];
  const aharnessStateMachines = [];
  const ignoredLines = [];
  let current = null;

  if (text == null) {
    return { repositories, aharnessStateMachines, tableCount: 0, ignoredLines };
  }

  let lineNumber = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    lineNumber += 1;
    const line = rawLine.replace(/#.*$/g, "").trim();
    if (line.length === 0) continue;
    if (line === "[[repositories]]") {
      current = {};
      repositories.push(current);
      continue;
    }
    if (line === "[[aharness.state_machines]]") {
      current = {};
      aharnessStateMachines.push(current);
      continue;
    }

    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (match && current) current[match[1]] = unquoteTomlValue(match[2]);
    else ignoredLines.push({ line: lineNumber, text: rawLine.slice(0, 160) });
  }

  return {
    repositories: repositories
      .filter((entry) => typeof entry.path === "string" && entry.path.trim().length > 0)
      .map((entry) => ({
        path: entry.path.trim(),
        label:
          typeof entry.label === "string" && entry.label.trim().length > 0
            ? entry.label.trim()
            : undefined,
      })),
    aharnessStateMachines: aharnessStateMachines
      .filter((entry) => typeof entry.target === "string" && entry.target.trim().length > 0)
      .map((entry) => ({
        target: entry.target.trim(),
        label:
          typeof entry.label === "string" && entry.label.trim().length > 0
            ? entry.label.trim()
            : entry.target.trim(),
        description:
          typeof entry.description === "string" && entry.description.trim().length > 0
            ? entry.description.trim()
            : undefined,
      })),
    tableCount: repositories.length + aharnessStateMachines.length,
    tables: {
      repositories: repositories.length,
      aharnessStateMachines: aharnessStateMachines.length,
    },
    ignoredLines,
  };
}

module.exports = {
  parsePlusToml,
  unquoteTomlValue,
};

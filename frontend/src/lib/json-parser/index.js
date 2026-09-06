export function safeParseModelJson(raw) {
  if (!raw) {
    return {
      categories: [],
    };
  }

  if (typeof raw === "object") {
    return raw;
  }

  let text = String(raw)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBracketIndex = text.search(/[\{\[]/);
  if (firstBracketIndex > -1) {
    text = text.substring(firstBracketIndex);
  }

  try {
    return JSON.parse(text);
  } catch { }

  const recovered = recoverJson(text);

  if (recovered) {
    return recovered;
  }

  return {
    categories: [],
  };
}

function recoverJson(text) {
  try {
    let output = "";
    let stack = [];

    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      output += ch;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (ch === "{") {
        stack.push("}");
      } else if (ch === "[") {
        stack.push("]");
      } else if (
        (ch === "}" || ch === "]") &&
        stack.length &&
        stack[stack.length - 1] === ch
      ) {
        stack.pop();
      }
    }

    if (inString) {
      output += '"';
    }

    output = output.replace(/,\s*$/g, "");

    while (stack.length) {
      output += stack.pop();
    }

    return JSON.parse(output);
  } catch {
    return trimUntilValid(text);
  }
}

function trimUntilValid(text) {
  let current = text;

  while (current.length > 0) {
    try {
      return JSON.parse(current);
    } catch {
      current = current.slice(0, -1);
    }
  }

  return null;
}

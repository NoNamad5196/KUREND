/** Plain-text AI output only. Never apply this to user input or verbatim source/evidence fields. */
export function stripMarkdownBold(text: string, { streaming = false }: { streaming?: boolean } = {}): string {
  if (!text.includes("**") && !(streaming && text.endsWith("*"))) return text;
  let output = "";
  let prose = "";
  const flush = (tail = false) => { output += stripProse(prose, streaming && tail); prose = ""; };
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    if (index === lineStart && /^(?: {4}|\t)/.test(rest)) {
      flush();
      const newline = text.indexOf("\n", index);
      const end = newline < 0 ? text.length : newline + 1;
      output += text.slice(index, end);
      index = end;
      continue;
    }
    const fence = /^(`{3,}|~{3,})/.exec(rest);
    // Fenced code, including an unfinished fence while streaming, is literal content.
    if (fence && /^ {0,3}$/.test(text.slice(lineStart, index))) {
      flush();
      const mark = fence[1];
      const close = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}[\\t ]*(?:\\r?\\n|$)`, "gm");
      close.lastIndex = index + mark.length;
      const match = close.exec(text);
      const end = match ? match.index + match[0].length : text.length;
      output += text.slice(index, end);
      index = end;
      continue;
    }
    const ticks = /^`+/.exec(rest);
    if (ticks && !isEscaped(text, index)) {
      flush();
      const close = new RegExp(`(?<!\\x60)\\x60{${ticks[0].length}}(?!\\x60)`, "g");
      close.lastIndex = index + ticks[0].length;
      const match = close.exec(text);
      const end = match ? match.index + match[0].length : text.length;
      output += text.slice(index, end);
      index = end;
      continue;
    }
    const math = rest.startsWith("\\(") ? ["\\(", "\\)"] : rest.startsWith("\\[") ? ["\\[", "\\]"] : rest.startsWith("$$") ? ["$$", "$$"] : rest[0] === "$" && !isEscaped(text, index) ? ["$", "$"] : null;
    if (math) {
      let end = text.indexOf(math[1], index + math[0].length);
      while (end >= 0 && isEscaped(text, end) && !math[1].startsWith("\\")) end = text.indexOf(math[1], end + math[1].length);
      const unfinishedMath = streaming && (math[0] !== "$" || !/^\$\s*\d/.test(rest));
      if (end >= 0 || unfinishedMath) {
        flush();
        end = end >= 0 ? end + math[1].length : text.length;
        output += text.slice(index, end);
        index = end;
        continue;
      }
    }
    prose += text[index++];
  }
  flush(true);
  return output;
}

function isEscaped(text: string, index: number): boolean {
  let count = 0;
  while (index > 0 && text[--index] === "\\") count++;
  return count % 2 === 1;
}

function isPowerOperator(text: string, index: number): boolean {
  // Include Latin/Greek/Cyrillic variables without classifying adjacent Korean prose as code.
  const before = /([A-Za-z_\u00c0-\u02ff\u0370-\u052f][\w.\u00c0-\u02ff\u0370-\u052f]*|\d+(?:\.\d+)?|[)\]])(\s*)$/u.exec(text.slice(0, index));
  const after = /^(\s*)([+-]?\s*(?:[A-Za-z_\u00c0-\u02ff\u0370-\u052f][\w.\u00c0-\u02ff\u0370-\u052f]*|(?:\d+(?:\.\d*)?|\.\d+)|[(\[]))/u.exec(text.slice(index + 2));
  if (!before || !after) return false;
  // Keep 2**3, x ** y, (x + 1)**2 and ordinary one-letter/numeric expressions.
  // The asymmetric spaces in "an **important** point" instead indicate bold delimiters.
  return Boolean(before[2]) === Boolean(after[1]) || /^[\d)\]]/.test(before[1]) || (/^[A-Za-z_\u00c0-\u02ff\u0370-\u052f]$/u.test(before[1]) && /^[+-]?\s*[\d.(\[]/.test(after[2]));
}

function stripProse(text: string, streaming: boolean): string {
  let output = "";
  let bold = false;
  for (let index = 0; index < text.length;) {
    if (text.startsWith("**", index) && !isEscaped(text, index)) {
      const before = text[index - 1];
      const after = text[index + 2];
      const nestedPower = after && !/\s/.test(after) && isPowerOperator(text, index) && text.indexOf("**", index + 2) >= 0;
      if (bold && before && !/\s/.test(before) && !nestedPower) {
        bold = false;
        index += 2;
        continue;
      }
      // A complete bold span wins over an ambiguous spaced operator, e.g. "answer **2**".
      const close = text.indexOf("**", index + 2);
      const completeBold = after && !/\s/.test(after) && close > index + 2 && !/\s/.test(text[close - 1]) && (!before || /\s|[([{:;,!?]/.test(before));
      if (!completeBold && isPowerOperator(text, index)) {
        output += "**";
        index += 2;
        continue;
      }
      bold = Boolean(after && !/\s/.test(after));
      index += 2;
      continue;
    }
    // Hold the first half of a possible delimiter until the next streamed chunk arrives.
    if (streaming && text[index] === "*" && index === text.length - 1 && !isEscaped(text, index)) break;
    output += text[index++];
  }
  return output;
}

// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program).
// Returns exactly what csv-reader's readCsv returns for {text, header}:
// {columns, rows, errors}. Same broken-row policy, byte for byte:
//  - U+FEFF at the very start dropped; record ends at LF/CRLF; a line left
//    with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (stray_cr).
//  - A field opening with a quote runs to the next non-doubled quote
//    ("" is one quote; CRLF/lone CR inside read as LF); what follows the
//    closing quote up to the next comma or line break is appended as it
//    stands (quote_junk, when the field ends); a quote that never closes
//    is a literal character and the text after it is re-read as unquoted
//    (unterminated_quote). A quote inside an unquoted field is literal.
//  - columns is the first record when header is true, else null; rows are
//    the records after it, padded with "" (short_row, fields: count) or cut
//    (long_row, extra: cut fields) to the first record's width.
//  - Each error is {code, line, row} in the order met; line is the 1-based
//    line its record starts on, row its index in rows (null for header).
//
// Speed: the reference walks one character at a time and builds every
// field with `value += c`. This reader instead jumps with String indexOf
// (native search) and slices whole fields at once, so the common case —
// a short unquoted field, a single-line quoted field — costs a couple of
// native calls instead of a JS loop per character. Only the rare broken
// paths (stray CR, line breaks inside quotes, doubled quotes, junk,
// unterminated quotes) fall back to slower per-character code, and only
// for the field that needs it.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at end of text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows.
  let recordLine = 1;
  let recordRow = null;
  // Cache of the next LF at or after the current field's start, per record.
  let lineEnd = -1;
  let lineEndValid = false;

  // Slow unquoted reader: from pos, one character at a time, handling
  // stray CRs. Used only when a fast scan met a stray CR, for the text
  // after a closing quote (quote junk), and to re-read after an
  // unterminated quote. `added` counts the characters kept after `init`.
  function slowUnquoted(init, added) {
    let value = init;
    let a = added;
    while (pos < n) {
      const ch = text.charCodeAt(pos);
      if (ch === 44) {
        pos += 1;
        return { value, ended: COMMA, added: a };
      }
      if (ch === 10) {
        pos += 1;
        line += 1;
        lineEndValid = false;
        return { value, ended: LINE_BREAK, added: a };
      }
      if (ch === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          lineEndValid = false;
          return { value, ended: LINE_BREAK, added: a };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        continue;
      }
      value += text[pos];
      a += 1;
      pos += 1;
    }
    return { value, ended: END, added: a };
  }

  // One quoted segment [p, q): the text with every CRLF or lone CR read
  // as LF, and `line` advanced past the line breaks inside it. Fast path
  // when the segment holds no CR or LF at all. The slice is checked, not
  // the whole text, so a check never scans past the segment.
  let qBroke = false;
  function quotedSegment(p, q) {
    const s = text.slice(p, q);
    if (!/[\r\n]/.test(s)) return s;
    const clean = s.replace(/\r\n?/g, '\n');
    let breaks = 0;
    let idx = -1;
    while ((idx = clean.indexOf('\n', idx + 1)) !== -1) breaks += 1;
    line += breaks;
    qBroke = true;
    return clean;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    lineEndValid = false;
    const fields = [];
    let fieldValue = '';
    let ended = END;
    let quoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        qBroke = false;
        let p = pos + 1;
        let value = '';
        let closed = false;
        let q = -1;
        while (true) {
          q = text.indexOf('"', p);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: the segment, then one quote character.
            value += quotedSegment(p, q);
            value += '"';
            p = q + 2;
            continue;
          }
          value += quotedSegment(p, q);
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          line = openLine;
          lineEndValid = false;
          const r = slowUnquoted('"', 0);
          fieldValue = r.value;
          ended = r.ended;
        } else {
          pos = q + 1;
          // The cached line end survives a quoted field that held no
          // line break: the next LF is still the same one.
          if (qBroke) lineEndValid = false;
          if (pos >= n) {
            fieldValue = value;
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              fieldValue = value;
              ended = COMMA;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              fieldValue = value;
              ended = LINE_BREAK;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              fieldValue = value;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands.
              const junk = slowUnquoted(value, 0);
              if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              fieldValue = junk.value;
              ended = junk.ended;
            }
          }
        }
      } else {
        quoted = false;
        if (!lineEndValid) {
          lineEnd = text.indexOf('\n', pos);
          lineEndValid = true;
        }
        const c = text.indexOf(',', pos);
        if (c !== -1 && (lineEnd === -1 || c < lineEnd)) {
          // Field ends at a comma; any CR inside it is a stray CR.
          fieldValue = text.slice(pos, c);
          if (fieldValue.indexOf('\r') === -1) {
            pos = c + 1;
            ended = COMMA;
          } else {
            const res = slowUnquoted('', 0);
            fieldValue = res.value;
            ended = res.ended;
          }
        } else {
          // Field ends at the line break, or at the end of the text.
          const lim = lineEnd === -1 ? n : lineEnd;
          fieldValue = text.slice(pos, lim);
          const r = fieldValue.indexOf('\r');
          if (r === -1) {
            if (lineEnd === -1) {
              pos = n;
              ended = END;
            } else {
              pos = lineEnd + 1;
              line += 1;
              lineEndValid = false;
              ended = LINE_BREAK;
            }
          } else if (lineEnd !== -1 && r === fieldValue.length - 1) {
            // CRLF line break.
            fieldValue = fieldValue.slice(0, -1);
            pos = lineEnd + 1;
            line += 1;
            lineEndValid = false;
            ended = LINE_BREAK;
          } else {
            const res = slowUnquoted('', 0);
            fieldValue = res.value;
            ended = res.ended;
          }
        }
      }
      fields.push(fieldValue);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

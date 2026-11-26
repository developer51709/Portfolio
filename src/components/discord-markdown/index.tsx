import { useState } from 'react';
import type { ReactNode } from 'react';
import { DiscordCodeBlock } from '../discord-code-block';

/**
 * Discord's message markdown, ported from the Niko bots website
 * (`web/src/components/DiscordMarkdown.tsx`), so a Lanyard `kv.bio` reads the
 * way the same text does in Discord: bold/italic/underline/strike, spoilers,
 * inline code, masked and bare links, timestamps, headings, quotes, subtext,
 * lists, tables, custom emoji from Discord's CDN and Discord's own highlighted
 * fenced code blocks.
 *
 * Niko's version also owns its popups (the emoji detail card and the mention
 * profile card), the bot's emoji catalog and its name-resolution endpoint.
 * Those are app features rather than rendering, so they are not part of the
 * port: an emoji is the artwork Discord draws, and a mention that cannot be
 * named keeps Discord's id fallback.
 */

type Format =
  | 'bold'
  | 'italic'
  | 'italicAlt'
  | 'underline'
  | 'strike'
  | 'spoiler';

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string }
  | { kind: 'emoji'; name: string; id: string; animated: boolean }
  | { kind: 'timestamp'; raw: string; unix: number; style: string }
  | {
      kind: 'mention';
      mention: 'user' | 'channel' | 'role' | 'everyone';
      id: string;
    }
  | { kind: 'format'; format: Format; children: Node[] };

type Token = Node | { kind: 'marker'; format: Format };

const markerText: Record<Format, string> = {
  bold: '**',
  italic: '*',
  italicAlt: '_',
  underline: '__',
  strike: '~~',
  spoiler: '||',
};

const timestampStyles = new Set(['t', 'T', 'd', 'D', 'f', 'F', 'R']);

// Every marker is a capture group, because the format each one opens is chosen
// by the group that matched: 8 bold (``**``), 9 underline (``__``), 10 italic
// (``*``), 11 italic-alt (``_``), 12 strike (``~~``), 13 spoiler (``||``).
// A bare URL is group 14 and is matched as one piece on purpose: ``_`` is legal
// in a query string, so a URL tokenised after the markers would be cut at its
// first underscore. The last character may not be a marker, so the ``**`` that
// closes a bold link stays a marker instead of being swallowed by the URL.
const tokenPattern =
  /(`[^`\n]+`)|(<t:-?\d+(?::[tTdDfFR])?>)|(<@!?\d+>|<@&\d+>|<#\d+>|@everyone\b|@here\b)|(<a?:[\w~]+:\d+>)|(\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+|\/[^\s)]*)\))|(\*\*)|(__)|((?<!\*)\*(?!\*))|((?<!_)_(?!_))|(~~)|(\|\|)|(https?:\/\/[^\s<>()*|~_](?:[^\s<>()*|~]*[^\s<>()*|~_])?)/g;

function timestampLabel(unix: number, style: string): string | null {
  if (!Number.isSafeInteger(unix) || !timestampStyles.has(style)) return null;
  const date = new Date(unix * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  if (style === 'R') {
    const seconds = unix - Math.floor(Date.now() / 1000);
    const distance = Math.abs(seconds);
    const unit =
      distance < 60
        ? 'second'
        : distance < 3600
          ? 'minute'
          : distance < 86400
            ? 'hour'
            : distance < 604800
              ? 'day'
              : distance < 2592000
                ? 'week'
                : distance < 31536000
                  ? 'month'
                  : 'year';
    const divisor = {
      second: 1,
      minute: 60,
      hour: 3600,
      day: 86400,
      week: 604800,
      month: 2592000,
      year: 31536000,
    }[unit];
    return new Intl.RelativeTimeFormat(undefined, {
      numeric: 'always',
    }).format(Math.round(seconds / divisor), unit);
  }
  const options: Intl.DateTimeFormatOptions =
    style === 't' || style === 'T'
      ? {
          hour: 'numeric',
          minute: '2-digit',
          ...(style === 'T' ? { second: '2-digit' } : {}),
        }
      : style === 'd'
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : style === 'D'
          ? { year: 'numeric', month: 'long', day: 'numeric' }
          : style === 'F'
            ? {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }
            : {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function tokenize(text: string): Node[] {
  const tokens: Token[] = [];
  let cursor = 0;
  const appendPlain = (value: string) => {
    const urls = /(https?:\/\/[^\s<>)]+)/g;
    let from = 0;
    let match: RegExpExecArray | null;
    while ((match = urls.exec(value))) {
      if (match.index > from) {
        tokens.push({ kind: 'text', text: value.slice(from, match.index) });
      }
      tokens.push({ kind: 'link', text: match[0], url: match[0] });
      from = urls.lastIndex;
    }
    if (from < value.length)
      tokens.push({ kind: 'text', text: value.slice(from) });
  };

  tokenPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text))) {
    if (match.index > cursor) appendPlain(text.slice(cursor, match.index));
    const raw = match[0];
    if (match[1]) tokens.push({ kind: 'code', text: raw.slice(1, -1) });
    else if (match[2]) {
      const parts = raw.match(/^<t:(-?\d+)(?::([tTdDfFR]))?>$/)!;
      tokens.push({
        kind: 'timestamp',
        raw,
        unix: Number(parts[1]),
        style: parts[2] || 'f',
      });
    } else if (match[3]) {
      const user = raw.match(/^<@!?([0-9]+)>$/);
      const role = raw.match(/^<@&([0-9]+)>$/);
      const channel = raw.match(/^<#([0-9]+)>$/);
      tokens.push(
        user
          ? { kind: 'mention', mention: 'user', id: user[1] }
          : role
            ? { kind: 'mention', mention: 'role', id: role[1] }
            : channel
              ? { kind: 'mention', mention: 'channel', id: channel[1] }
              : { kind: 'mention', mention: 'everyone', id: raw },
      );
    } else if (match[4]) {
      const [, animated, name, id] = raw.match(/^<(a?):([\w~]+):(\d+)>$/)!;
      tokens.push({ kind: 'emoji', animated: animated === 'a', name, id });
    } else if (match[5])
      tokens.push({ kind: 'link', text: match[6], url: match[7] });
    else if (match[8]) tokens.push({ kind: 'marker', format: 'bold' });
    else if (match[9]) tokens.push({ kind: 'marker', format: 'underline' });
    else if (match[10]) tokens.push({ kind: 'marker', format: 'italic' });
    else if (match[11]) tokens.push({ kind: 'marker', format: 'italicAlt' });
    else if (match[12]) tokens.push({ kind: 'marker', format: 'strike' });
    else if (match[13]) tokens.push({ kind: 'marker', format: 'spoiler' });
    else if (match[14])
      tokens.push({ kind: 'link', text: match[14], url: match[14] });
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < text.length) appendPlain(text.slice(cursor));

  const roots: Node[] = [];
  const stack: { format: Format; children: Node[] }[] = [];
  const append = (node: Node) =>
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
  for (const token of tokens) {
    if (token.kind !== 'marker') {
      append(token);
      continue;
    }
    const open = stack.findIndex((frame) => frame.format === token.format);
    if (open < 0) stack.push({ format: token.format, children: [] });
    else {
      const closed = stack.splice(open);
      const formatted: Node[] = [...closed[0].children];
      for (const frame of closed.slice(1)) {
        formatted.push(
          { kind: 'text', text: markerText[frame.format] },
          ...frame.children,
        );
      }
      append({ kind: 'format', format: token.format, children: formatted });
    }
  }
  while (stack.length) {
    const frame = stack.pop()!;
    const parent = stack.length ? stack[stack.length - 1].children : roots;
    parent.push(
      { kind: 'text', text: markerText[frame.format] },
      ...frame.children,
    );
  }
  return roots;
}

/**
 * A Discord custom emoji.
 *
 * Discord never draws a broken emoji: when it cannot resolve one — a deleted
 * emoji, an emoji from another server, a stale id — it writes the name out
 * between colons as plain text. The fallback here is the same, which also keeps
 * a failed image from shifting the line or eating the formatting around it.
 */
function DiscordEmoji({
  name,
  id,
  animated = false,
}: {
  name: string;
  id: string;
  animated?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  if (!id || broken) {
    return (
      <span className="discord-emoji-fallback" data-discord-emoji-name={name}>
        {`:${name}:`}
      </span>
    );
  }
  return (
    <img
      className="discord-md-emoji"
      data-discord-emoji-name={name}
      data-emoji-id={id}
      src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`}
      alt={`:${name}:`}
      title={`:${name}:`}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Discord's spoiler: the content stays hidden until it is clicked, and while it
 * is hidden every link inside it is inert. That way a spoiler can never be used
 * to trick someone into opening a link they have not chosen to reveal.
 */
function DiscordSpoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const reveal = () => setRevealed(true);
  return (
    <span
      className={`discord-md-spoiler${revealed ? ' is-revealed' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={revealed ? undefined : 'Reveal spoiler'}
      onClick={(event) => {
        if (revealed) return;
        event.preventDefault();
        event.stopPropagation();
        reveal();
      }}
      onKeyDown={(event) => {
        if (revealed || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        event.stopPropagation();
        reveal();
      }}
    >
      {children}
    </span>
  );
}

function renderInline(nodes: Node[], prefix = 'discord-md'): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (node.kind === 'text') return <span key={key}>{node.text}</span>;
    if (node.kind === 'code')
      return (
        <code key={key} className="discord-md-code">
          {node.text}
        </code>
      );
    if (node.kind === 'link') {
      // Discord lets a masked link's text be an inline code span. The code
      // keeps its box and takes the link's colour instead of the code colour.
      const code = /^`([^`\n]+)`$/.exec(node.text);
      // Only a web link leaves the site. An address opens the mail client in
      // place, so it cannot claim a new tab.
      const external = /^https?:\/\//i.test(node.url);
      return (
        <a
          key={key}
          className="discord-md-link"
          href={node.url}
          {...(external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
        >
          {code ? (
            <code className="discord-md-code">{code[1]}</code>
          ) : (
            node.text
          )}
        </a>
      );
    }
    if (node.kind === 'emoji')
      return (
        <DiscordEmoji
          key={key}
          name={node.name}
          id={node.id}
          animated={node.animated}
        />
      );
    if (node.kind === 'timestamp') {
      const label = timestampLabel(node.unix, node.style);
      const date = new Date(node.unix * 1000);
      return label ? (
        <time
          key={key}
          className="discord-md-timestamp"
          dateTime={date.toISOString()}
          title={node.raw}
        >
          {label}
        </time>
      ) : (
        <span key={key}>{node.raw}</span>
      );
    }
    if (node.kind === 'mention') {
      const label =
        node.mention === 'everyone'
          ? node.id
          : `${node.mention === 'channel' ? '#' : '@'}${node.id}`;
      return (
        <span
          key={key}
          className={`discord-md-mention discord-md-mention-${node.mention}`}
          title={
            node.mention === 'everyone'
              ? undefined
              : `${node.mention} · ${node.id}`
          }
        >
          {label}
        </span>
      );
    }
    if (node.format === 'spoiler') {
      return (
        <DiscordSpoiler key={key}>
          {renderInline(node.children, key)}
        </DiscordSpoiler>
      );
    }
    const style =
      node.format === 'bold'
        ? { fontWeight: 700 }
        : node.format === 'italic' || node.format === 'italicAlt'
          ? { fontStyle: 'italic' as const }
          : node.format === 'underline'
            ? { textDecoration: 'underline' }
            : { textDecoration: 'line-through' };
    return (
      <span key={key} style={style}>
        {renderInline(node.children, key)}
      </span>
    );
  });
}

/**
 * Renders one Discord message body. A line that opens a fence is a code block
 * (its language only chooses the highlighting, never printed), a run of lines
 * starting with ``>`` is one quote, ``-# `` is Discord's subtext, ``#``/``##``
 * are headings, and pipe rows are a table.
 */
export function DiscordMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split('\n');
  const children: ReactNode[] = [];

  const renderInlineText = (line: string, key: string | number) => {
    let content = line;
    const task = content.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    const ordered = content.match(/^\s*(\d+)\.\s+(.*)$/);
    if (task) content = `• ${task[2]}`;
    else if (/^\s*[-*]\s+/.test(content)) {
      content = `• ${content.replace(/^\s*[-*]\s+/, '')}`;
    } else if (ordered) content = `${ordered[1]}. ${ordered[2]}`;
    return (
      <span key={key} className={task ? 'discord-md-task' : undefined}>
        {renderInline(tokenize(content), `line-${key}`)}
      </span>
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim().split(/\s+/)[0] || '';
      const code: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !lines[index].trimStart().startsWith('```')
      ) {
        code.push(lines[index++]);
      }
      children.push(
        <DiscordCodeBlock
          code={code.join('\n')}
          language={language}
          key={`code-${index}`}
        />,
      );
      continue;
    }

    // A double pipe is a spoiler, not the first cell of a table row.
    const isTableRow = (value: string) =>
      value.trimStart().startsWith('|') && !value.trimStart().startsWith('||');
    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(
          lines[index++]
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim()),
        );
      }
      index -= 1;
      const isSeparator = (cells: string[]) =>
        cells.length > 0 &&
        cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')));
      const header = rows[0];
      const body =
        rows.length > 1 && isSeparator(rows[1]) ? rows.slice(2) : rows.slice(1);
      children.push(
        <div className="discord-md-table-wrap" key={`table-${index}`}>
          <table className="discord-md-table">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>
                    {renderInline(
                      tokenize(cell),
                      `table-head-${index}-${cellIndex}`,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      {renderInline(
                        tokenize(cell),
                        `table-${index}-${rowIndex}-${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const Heading = `h${heading[1].length}` as 'h1' | 'h2' | 'h3' | 'h4';
      children.push(
        <Heading className="discord-md-heading" key={index}>
          {renderInline(tokenize(heading[2]), `line-${index}`)}
        </Heading>,
      );
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      // Consecutive quote lines are one quote in Discord: a single rounded bar
      // runs down the left of the whole run instead of restarting per line.
      const quoteLines: string[] = [];
      const quoteStart = index;
      while (index < lines.length) {
        const next = lines[index].trimStart().match(/^>\s?(.*)$/);
        if (!next) break;
        quoteLines.push(next[1]);
        index += 1;
      }
      index -= 1;
      children.push(
        <blockquote className="discord-md-quote" key={`quote-${quoteStart}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <span key={quoteIndex}>
              {renderInlineText(quoteLine, `quote-${quoteStart}-${quoteIndex}`)}
              {quoteIndex < quoteLines.length - 1 ? <br /> : null}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    const subtext = trimmed.startsWith('-# ');
    const content = subtext ? trimmed.slice(3) : line;
    const inline = renderInlineText(content, index);
    children.push(
      subtext ? (
        <small className="discord-md-subtext" key={index}>
          {inline}
          {index < lines.length - 1 ? <br /> : null}
        </small>
      ) : (
        <span key={index}>
          {inline}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ),
    );
  }

  return (
    <div className={`discord-markdown${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export default DiscordMarkdown;

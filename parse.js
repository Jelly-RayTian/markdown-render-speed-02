/**
 * parse.js: a speed-tuned fork of marked v18.1.3 (https://github.com/markedjs/marked), fixed to
 * marked's default options (gfm on, breaks off, pedantic off, no extensions or hooks).
 * marked: Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey. MIT License.
 * See LICENSE and NOTICE.
 *
 * parse(markdown) returns exactly the string marked.parse(markdown) returns.
 */

// ---------------------------------------------------------------------------------------------
// Regex construction (same composition steps as marked, so the resulting sources are identical)
// ---------------------------------------------------------------------------------------------

const caretRe = /(^|[^\[])\^/g;

function edit(regex, flags = '') {
  let source = typeof regex === 'string' ? regex : regex.source;
  const api = {
    replace(name, value) {
      let v = typeof value === 'string' ? value : value.source;
      v = v.replace(caretRe, '$1');
      source = source.replace(name, v);
      return api;
    },
    getRegex() {
      return new RegExp(source, flags);
    },
  };
  return api;
}

const noMatch = { exec: () => null };

function cachedBy(build) {
  const cache = [];
  return (indent) => {
    const k = Math.max(0, Math.min(3, indent - 1));
    let r = cache[k];
    if (!r) { r = build(k); cache[k] = r; }
    return r;
  };
}

const blockTags = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

const other = {
  codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  endingSpaceTabChar: /[ \t]$/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  leadingSpaceTab: /^[ \t]+/,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  blockquoteMarkerWhitespace: /^( {0,3}>)([ \t]+)/gm,
  listIsTask: /^\[[ xX]\][ \t]+\S/,
  listReplaceTask: /^\[[ xX]\][ \t]+/,
  listTaskCheckbox: /\[[ xX]\]/,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /[:|]/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
  endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,
  numericCharacterReferenceOrAmpersand: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  percentDecode: /%25/g,
  findPipe: /\|/g,
  splitPipe: / \|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  listItemRegex: (bull) => new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`),
  nextBulletRegex: cachedBy((n) => new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`)),
  hrRegex: cachedBy((n) => new RegExp(`^ {0,${n}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`)),
  fencesBeginRegex: cachedBy((n) => new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`)),
  headingBeginRegex: cachedBy((n) => new RegExp(`^ {0,${n}}#{1,6}(?:\\s|$)`)),
  htmlBeginRegex: cachedBy((n) => new RegExp(`^ {0,${n}}(?:</?(?:${blockTags})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i')),
  blockquoteBeginRegex: cachedBy((n) => new RegExp(`^ {0,${n}}>`)),
};

// ----- block grammar (gfm) -----
const bNewline = /^(?:[ \t]*(?:\n|$))+/;
const bCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const bFences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const bHr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const bHeading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const bBullet = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const bLheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/;
const bLheading = edit(bLheadingCore)
  .replace(/bull/g, bBullet)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/)
  .getRegex();
const bParagraphCore = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const bText = /^[^\n]+/;
const bLabel = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const bDef = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .replace('label', bLabel)
  .replace('title', /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/)
  .getRegex();
const bList = edit(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, bBullet).getRegex();
const commentRe = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const bHtml = edit('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))', 'i')
  .replace('comment', commentRe)
  .replace('tag', blockTags)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
  .getRegex();
const paragraphFor = (list) => edit(bParagraphCore)
  .replace('hr', bHr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('|table', '')
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', list)
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', blockTags)
  .getRegex();
const bBlockquoteParagraph = paragraphFor(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
const bBlockquote = edit(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/)
  .replace('paragraph', bBlockquoteParagraph)
  .getRegex();
const bTable = edit('^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)')
  .replace('hr', bHr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('blockquote', ' {0,3}>')
  .replace('code', '(?: {4}| {0,3}\t)[^\\n]')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', blockTags)
  .getRegex();
const bParagraph = edit(bParagraphCore)
  .replace('hr', bHr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('table', bTable)
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', blockTags)
  .getRegex();

// ----- inline grammar (gfm) -----
const iEscape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
const iCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const iBr = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const pPunct = /[\p{P}\p{S}]/u;
const pPunctSpace = /[\s\p{P}\p{S}]/u;
const pNotPunctSpace = /[^\s\p{P}\p{S}]/u;
const iPunctuation = edit(/^((?![*_])punctSpace)/, 'u').replace(/punctSpace/g, pPunctSpace).getRegex();
const gfmPunct = /(?!~)[\p{P}\p{S}]/u;
const gfmPunctSpace = /(?!~)[\s\p{P}\p{S}]/u;
const gfmNotPunctSpace = /(?:[^\s\p{P}\p{S}]|~)/u;
const iBlockSkip = edit(/link|precode-code|html/, 'g')
  .replace('link', /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/)
  .replace('precode-', '(?<!`)()')
  .replace('code', /(?<b>`+)[^`]+\k<b>(?!`)/)
  .replace('html', /<(?! )[^<>]*?>/)
  .getRegex();
const emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
const iEmStrongLDelim = edit(emStrongLDelimCore, 'u').replace(/punct/g, gfmPunct).getRegex();
const emStrongRDelimAstCore = '^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)';
const iEmStrongRDelimAst = edit(emStrongRDelimAstCore, 'gu')
  .replace(/notPunctSpace/g, gfmNotPunctSpace)
  .replace(/punctSpace/g, gfmPunctSpace)
  .replace(/punct/g, gfmPunct)
  .getRegex();
const iEmStrongRDelimUnd = edit('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)', 'gu')
  .replace(/notPunctSpace/g, pNotPunctSpace)
  .replace(/punctSpace/g, pPunctSpace)
  .replace(/punct/g, pPunct)
  .getRegex();
const iDelLDelim = edit(/^~~?(?:((?!~)punct)|[^\s~])/, 'u').replace(/punct/g, pPunct).getRegex();
const iDelRDelim = edit('^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)', 'gu')
  .replace(/notPunctSpace/g, pNotPunctSpace)
  .replace(/punctSpace/g, pPunctSpace)
  .replace(/punct/g, pPunct)
  .getRegex();
const iAnyPunctuation = edit(/\\(punct)/, 'gu').replace(/punct/g, pPunct).getRegex();
const iAnyPunctuationOutsideCode = edit(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu').replace(/punct/g, pPunct).getRegex();
const iAutolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
  .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/)
  .getRegex();
const tagComment = edit(commentRe).replace('(?:-->|$)', '-->').getRegex();
const iTag = edit('^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>')
  .replace('comment', tagComment)
  .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/)
  .getRegex();
const brackets = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const linkLabel = edit(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace('brackets', brackets).getRegex();
const iLink = edit(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .replace('label', linkLabel)
  .replace('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .replace('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/)
  .getRegex();
const iReflink = edit(/^!?\[(label)\]\[(ref)\]/).replace('label', linkLabel).replace('ref', bLabel).getRegex();
const iNolink = edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', bLabel).getRegex();
const searchRef = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const searchLabel = edit(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace('brackets', brackets).getRegex();
const iReflinkSearch = edit('reflink|nolink(?!\\()', 'g')
  .replace('reflink', edit(/^!?\[(label)\]\[(ref)\]/).replace('label', searchLabel).replace('ref', searchRef).getRegex())
  .replace('nolink', edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', searchRef).getRegex())
  .getRegex();
const protocolRe = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const emailCore = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const emailProtocol = edit(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, emailCore).getRegex();
const iUrl = edit(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .replace('emailProtocol', emailProtocol)
  .replace('protocol', protocolRe)
  .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/)
  .getRegex();
const iBackpedal = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const iText = edit(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .replace('protocol', protocolRe)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', '(?<![^\\s*_~(])www\\.')
  .getRegex();
// Equivalent text rules for sources that cannot contain the removed constructs:
// without '@' the email lookaheads never match; without '@', ':' and 'www.' no url can
// start where the protocol/www stops would split text, and split text tokens merge again.
const iTextNoEmail = edit(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol))))/)
  .replace('protocol', protocolRe)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', '(?<![^\\s*_~(])www\\.')
  .getRegex();
const iTextSimple = /^(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|$)|[^ ](?= {2,}\n)))/;
function pickTextRule(src) {
  if (src.includes('@')) return iText;
  if (src.includes(':') || src.includes('www.')) return iTextNoEmail;
  return iTextSimple;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeChar = (ch) => escapeMap[ch];

function escapeHtml(html, encode) {
  if (encode) {
    if (other.escapeTest.test(html)) return html.replace(other.escapeReplace, escapeChar);
  } else if (other.escapeTestNoEncode.test(html)) {
    return html.replace(other.escapeReplaceNoEncode, escapeChar);
  }
  return html;
}

function decodeNumericRefs(text) {
  if (!other.numericCharacterReference.test(text)) return text;
  return text.replace(other.numericCharacterReferenceOrAmpersand, (all, dec, hex) => {
    if (dec === undefined && hex === undefined) return '&amp;';
    const cp = dec === undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    if (cp === 0 || cp > 1114111 || (cp >= 55296 && cp <= 57343)) return '\uFFFD';
    if (cp === 38) return '&amp;';
    return String.fromCodePoint(cp);
  });
}

function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(other.percentDecode, '%');
  } catch {
    return null;
  }
  return href;
}

function splitCells(tableRow, count) {
  const row = tableRow.replace(other.findPipe, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === '\\') escaped = !escaped;
    return escaped ? '|' : ' |';
  });
  const cells = row.split(other.splitPipe);
  if (!cells[0].trim()) cells.shift();
  if (cells.length > 0 && !cells.at(-1)?.trim()) cells.pop();
  if (count) {
    if (cells.length > count) cells.splice(count);
    else while (cells.length < count) cells.push('');
  }
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i].trim().replace(other.slashPipe, '|');
  return cells;
}

function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) return '';
  let suffLen = 0;
  while (suffLen < l) {
    const ch = str.charAt(l - suffLen - 1);
    if (ch === c && !invert) suffLen++;
    else if (ch !== c && invert) suffLen++;
    else break;
  }
  return str.slice(0, l - suffLen);
}

function trimTrailingBlankLines(src) {
  const lines = src.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && other.blankLine.test(lines[i])) i--;
  return lines.length - i <= 2 ? src : lines.slice(0, i + 1).join('\n');
}

function normalizeLabel(label) {
  return label.trim().replace(other.multipleSpaceGlobal, ' ').toLowerCase().toUpperCase().toLowerCase();
}

function findClosingBracket(str, b) {
  if (str.indexOf(b[0]) === -1 && str.indexOf(b[1]) === -1) return -1;
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') i++;
    else if (str[i] === b[0]) level++;
    else if (str[i] === b[1]) {
      level--;
      if (level < 0) return i;
    }
  }
  return level > 0 ? -2 : -1;
}

function closerIndexes(src) {
  const em = { '*': -1, _: -1 };
  let del = -1;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const ch = src[i];
    if (ch !== '*' && ch !== '_' && ch !== '~') continue;
    const prev = i === 0 ? '\n' : src[i - 1];
    let j = i + 1;
    while (j < n && src[j] === ch) j++;
    if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r' && prev !== '\f') {
      if (ch === '~') del = i;
      else em[ch] = i;
    }
    i = j - 1;
  }
  return { maskedSrc: src, em, del };
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;

// [...s].length without the array
function codePointCount(s) {
  let n = s.length;
  for (let i = 0; i < s.length - 1; i++) {
    if (isHigh(s.charCodeAt(i)) && isLow(s.charCodeAt(i + 1))) { n--; i++; }
  }
  return n;
}

// [...s][0].length
function firstCodePointLength(s) {
  return s.length > 1 && isHigh(s.charCodeAt(0)) && isLow(s.charCodeAt(1)) ? 2 : 1;
}

// [...s.slice(Math.max(0, end - 2), end)].at(-1) ?? ''
function lastCodePointBefore(s, end) {
  if (end <= 0) return '';
  if (end >= 2 && isLow(s.charCodeAt(end - 1)) && isHigh(s.charCodeAt(end - 2))) return s.slice(end - 2, end);
  return s[end - 1];
}

function firstLine(s) {
  const i = s.indexOf('\n');
  return i === -1 ? s : s.slice(0, i);
}

function expandTabs(text, col = 0) {
  let c = col;
  let out = '';
  for (const ch of text) {
    if (ch === '\t') {
      const w = 4 - (c % 4);
      out += ' '.repeat(w);
      c += w;
    } else {
      out += ch;
      c++;
    }
  }
  return out;
}

function indentCodeCompensation(raw, text) {
  const m = raw.match(other.indentCodeCompensation);
  if (m === null) return text;
  const indent = m[1];
  return text.split('\n').map((node) => {
    const ms = node.match(other.beginningSpace);
    if (ms === null) return node;
    const [space] = ms;
    return node.slice(Math.min(space.length, indent.length));
  }).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Lexer (tokenizer folded in)
// ---------------------------------------------------------------------------------------------

class Lexer {
  constructor() {
    this.tokens = [];
    this.links = Object.create(null);
    this.inlineQueue = [];
    this.state = { inLink: false, inRawBlock: false, linkEmitted: false, linkParenPossible: true, top: true };
    this.closerStack = [];
  }

  lex(src) {
    src = src.replace(other.carriageReturn, '\n');
    this.blockTokens(src, this.tokens);
    const q = this.inlineQueue;
    for (let i = 0; i < q.length; i++) {
      const next = q[i];
      this.state.inRawBlock = false;
      this.inlineTokens(next.src, next.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }

  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }

  // ----- block tokenizers -----

  space(src) {
    const cap = bNewline.exec(src);
    if (cap && cap[0].length > 0) return { type: 'space', raw: cap[0] };
  }

  code(src) {
    const cap = bCode.exec(src);
    if (cap) {
      const raw = trimTrailingBlankLines(cap[0]);
      const text = raw.replace(other.codeRemoveIndent, '');
      return { type: 'code', raw, codeBlockStyle: 'indented', text };
    }
  }

  fences(src) {
    const cap = bFences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || '');
      return { type: 'code', raw, lang: cap[2] ? cap[2].trim().replace(iAnyPunctuation, '$1') : cap[2], text };
    }
  }

  heading(src) {
    const cap = bHeading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (other.endingHash.test(text)) {
        const trimmed = rtrim(text, '#');
        if (!trimmed || other.endingSpaceTabChar.test(trimmed)) text = trimmed.trim();
      }
      return { type: 'heading', raw: rtrim(cap[0], '\n'), depth: cap[1].length, text, tokens: this.inline(text) };
    }
  }

  hr(src) {
    const cap = bHr.exec(src);
    if (cap) return { type: 'hr', raw: rtrim(cap[0], '\n') };
  }

  blockquote(src) {
    const cap = bBlockquote.exec(src);
    if (!cap) return;
    let lines = rtrim(cap[0], '\n').split('\n');
    let raw = '';
    let text = '';
    const tokens = [];
    while (lines.length > 0) {
      let inBlockquote = false;
      const currentLines = [];
      let i;
      for (i = 0; i < lines.length; i++) {
        if (other.blockquoteStart.test(lines[i])) {
          currentLines.push(lines[i]);
          inBlockquote = true;
        } else if (!inBlockquote) {
          currentLines.push(lines[i]);
        } else {
          break;
        }
      }
      lines = lines.slice(i);
      const currentRaw = currentLines.join('\n');
      const currentText = currentRaw
        .replace(other.blockquoteMarkerWhitespace, (m, marker, ws) => marker + expandTabs(ws, marker.length))
        .replace(other.blockquoteSetextReplace, '\n    $1')
        .replace(other.blockquoteSetextReplace2, '');
      raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
      text = text ? `${text}\n${currentText}` : currentText;
      const top = this.state.top;
      this.state.top = true;
      this.blockTokens(currentText, tokens, true);
      this.state.top = top;
      if (lines.length === 0) break;
      const last = tokens.at(-1);
      const lt = last?.type;
      if (lt === 'code' || lt === 'heading' || lt === 'hr' || lt === 'html' || lt === 'table') break;
      if (lt === 'blockquote') {
        const oldToken = last;
        const newText = oldToken.raw + '\n' + lines.join('\n').replace(other.blockquoteSetextReplace2, '');
        const newToken = this.blockquote(newText);
        tokens[tokens.length - 1] = newToken;
        const rest = newText.substring(newToken.raw.length).replace(/^\n/, '');
        const restCount = rest ? rest.split('\n').length : 0;
        const consumed = restCount ? lines.slice(0, -restCount) : lines;
        if (consumed.length > 0) raw = `${raw}\n${consumed.join('\n')}`;
        text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
        lines = lines.slice(consumed.length);
        if (lines.length > 0 && other.blockquoteStart.test(lines[0])) continue;
        break;
      } else if (lt === 'list') {
        const oldToken = last;
        const newText = oldToken.raw + '\n' + lines.join('\n');
        const newToken = this.list(newText);
        tokens[tokens.length - 1] = newToken;
        const consumed = newToken.raw.length > oldToken.raw.length
          ? newText.slice(oldToken.raw.length + 1, newToken.raw.length).split('\n').length
          : 0;
        if (consumed > 0) {
          const extra = lines.slice(0, consumed).join('\n');
          raw = `${raw}\n${extra}`;
          text = `${text}\n${extra}`;
        }
        lines = lines.slice(consumed);
        continue;
      }
    }
    return { type: 'blockquote', raw, tokens, text };
  }

  list(src) {
    let cap = bList.exec(src);
    if (!cap) return;
    const origSrc = src;
    let bull = cap[1].trim();
    const isOrdered = bull.length > 1;
    const list = { type: 'list', raw: '', ordered: isOrdered, start: isOrdered ? +bull.slice(0, -1) : '', loose: false, items: [] };
    bull = isOrdered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
    const itemRegex = other.listItemRegex(bull);
    let endsWithBlankLine = false;
    while (src) {
      let endEarly = false;
      let itemContents = '';
      if (!(cap = itemRegex.exec(src))) break;
      if (bHr.test(src)) break;
      const itemStart = origSrc.length - src.length;
      src = src.substring(cap[0].length);
      const line0 = firstLine(cap[2]);
      const markerLen = cap[1].length;
      let line = line0.indexOf('\t') === -1 ? line0 : line0.replace(other.leadingSpaceTab, (t) => expandTabs(t, markerLen));
      let nextLine = firstLine(src);
      let blankLine = !line.trim();
      let indent = 0;
      if (blankLine) {
        indent = markerLen + 1;
      } else {
        indent = line.search(other.nonSpaceChar);
        indent = indent > 4 ? 1 : indent;
        itemContents = line.slice(indent);
        indent += markerLen;
      }
      if (blankLine && other.blankLine.test(nextLine)) {
        src = src.substring(nextLine.length + 1);
        endEarly = true;
      }
      if (!endEarly) {
        const nextBulletRegex = other.nextBulletRegex(indent);
        const hrRegex = other.hrRegex(indent);
        const fencesBeginRegex = other.fencesBeginRegex(indent);
        const headingBeginRegex = other.headingBeginRegex(indent);
        const htmlBeginRegex = other.htmlBeginRegex(indent);
        const blockquoteBeginRegex = other.blockquoteBeginRegex(indent);
        while (src) {
          const rawLine = firstLine(src);
          nextLine = rawLine;
          const nextLineWithoutTabs = nextLine.indexOf('\t') === -1 ? nextLine : nextLine.replace(other.leadingSpaceTab, (t) => expandTabs(t));
          if (fencesBeginRegex.test(nextLine) || headingBeginRegex.test(nextLine) || htmlBeginRegex.test(nextLine)
            || blockquoteBeginRegex.test(nextLine) || nextBulletRegex.test(nextLine) || hrRegex.test(nextLine)) break;
          if (nextLineWithoutTabs.search(other.nonSpaceChar) >= indent || !nextLine.trim()) {
            itemContents += '\n' + nextLineWithoutTabs.slice(indent);
          } else {
            if (blankLine || (line.indexOf('\t') === -1 ? line : line.replace(other.tabCharGlobal, '    ')).search(other.nonSpaceChar) >= 4
              || fencesBeginRegex.test(line) || headingBeginRegex.test(line) || htmlBeginRegex.test(line) || hrRegex.test(line)) break;
            const add = /^ {0,3}(?:=+|-+) *$/.test(nextLine) && bLheading.test(`${line}\n${nextLine}`)
              ? `    ${nextLineWithoutTabs.replace(/^ {0,3}/, '')}`
              : nextLine;
            itemContents += '\n' + add;
          }
          blankLine = !nextLine.trim();
          src = src.substring(rawLine.length + 1);
          line = nextLineWithoutTabs.slice(indent);
        }
      }
      const raw = origSrc.slice(itemStart, origSrc.length - src.length);
      if (!list.loose) {
        if (endsWithBlankLine) list.loose = true;
        else if (other.doubleBlankLine.test(raw)) endsWithBlankLine = true;
      }
      list.items.push({ type: 'list_item', raw, task: other.listIsTask.test(itemContents), loose: false, text: itemContents, tokens: [] });
    }
    const lastItem = list.items.at(-1);
    if (!lastItem) return;
    lastItem.raw = lastItem.raw.trimEnd();
    lastItem.text = lastItem.text.trimEnd();
    list.raw = origSrc.slice(0, origSrc.length - src.length).trimEnd();
    for (const item of list.items) {
      this.state.top = false;
      item.tokens = this.blockTokens(item.text, []);
      if (!list.loose) {
        const spacers = item.tokens.filter((t) => t.type === 'space');
        list.loose = spacers.length > 0 && spacers.some((t) => other.anyLine.test(t.raw));
      }
    }
    for (const item of list.items) {
      const first = item.tokens[0];
      if (item.task && (first?.type === 'text' || first?.type === 'paragraph')) {
        item.text = item.text.replace(other.listReplaceTask, '');
        first.raw = first.raw.replace(other.listReplaceTask, '');
        first.text = first.text.replace(other.listReplaceTask, '');
        const q = this.inlineQueue;
        for (let i = q.length - 1; i >= 0; i--) {
          if (other.listIsTask.test(q[i].src)) {
            q[i].src = q[i].src.replace(other.listReplaceTask, '');
            break;
          }
        }
        const box = other.listTaskCheckbox.exec(item.raw);
        if (box) {
          const checkbox = { type: 'checkbox', raw: box[0] + ' ', checked: box[0] !== '[ ]' };
          item.checked = checkbox.checked;
          if (list.loose) {
            const t0 = item.tokens[0];
            if (t0 && (t0.type === 'paragraph' || t0.type === 'text') && 'tokens' in t0 && t0.tokens) {
              t0.raw = checkbox.raw + t0.raw;
              t0.text = checkbox.raw + t0.text;
              t0.tokens.unshift(checkbox);
            } else {
              item.tokens.unshift({ type: 'paragraph', raw: checkbox.raw, text: checkbox.raw, tokens: [checkbox] });
            }
          } else {
            item.tokens.unshift(checkbox);
          }
        }
      } else if (item.task) {
        item.task = false;
      }
    }
    if (list.loose) {
      for (const item of list.items) {
        item.loose = true;
        for (const t of item.tokens) if (t.type === 'text') t.type = 'paragraph';
      }
    }
    return list;
  }

  html(src) {
    const cap = bHtml.exec(src);
    if (cap) {
      const text = trimTrailingBlankLines(cap[0]);
      return { type: 'html', block: true, raw: text, pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style', text };
    }
  }

  def(src) {
    const cap = bDef.exec(src);
    if (cap) {
      if (!other.startAngleBracket.test(cap[2]) && findClosingBracket(cap[2], '()') !== -1) return;
      const tag = normalizeLabel(cap[1]);
      const href = cap[2] ? cap[2].replace(other.hrefBrackets, '$1').replace(iAnyPunctuation, '$1') : '';
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(iAnyPunctuation, '$1') : cap[3];
      return { type: 'def', tag, raw: rtrim(cap[0], '\n'), href, title };
    }
  }

  table(src) {
    const cap = bTable.exec(src);
    if (!cap || !other.tableDelimiter.test(cap[2])) return;
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(other.tableAlignChars, '').split('|');
    const rows = cap[3]?.trim() ? cap[3].replace(other.tableRowBlankLine, '').split('\n') : [];
    const item = { type: 'table', raw: rtrim(cap[0], '\n'), header: [], align: [], rows: [] };
    if (headers.length !== aligns.length) return;
    for (const a of aligns) {
      if (other.tableAlignRight.test(a)) item.align.push('right');
      else if (other.tableAlignCenter.test(a)) item.align.push('center');
      else if (other.tableAlignLeft.test(a)) item.align.push('left');
      else item.align.push(null);
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({ text: headers[i], tokens: this.inline(headers[i]), header: true, align: item.align[i] });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, i) => ({ text: cell, tokens: this.inline(cell), header: false, align: item.align[i] })));
    }
    return item;
  }

  lheading(src) {
    const cap = bLheading.exec(src);
    if (cap) {
      const text = cap[1].trim();
      return { type: 'heading', raw: rtrim(cap[0], '\n'), depth: cap[2].charAt(0) === '=' ? 1 : 2, text, tokens: this.inline(text) };
    }
  }

  paragraph(src) {
    const cap = bParagraph.exec(src);
    if (cap) {
      const text = cap[1].charAt(cap[1].length - 1) === '\n' ? cap[1].slice(0, -1) : cap[1];
      return { type: 'paragraph', raw: cap[0], text, tokens: this.inline(text) };
    }
  }

  text(src) {
    const cap = bText.exec(src);
    if (cap) return { type: 'text', raw: cap[0], text: cap[0], tokens: this.inline(cap[0]) };
  }

  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    let minLen = Infinity;
    while (src) {
      if (src.length < minLen) minLen = src.length;
      else { infiniteLoop(src.charCodeAt(0)); break; }
      let token;
      if ((token = this.space(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (token.raw.length === 1 && last !== undefined) last.raw += '\n';
        else tokens.push(token);
        continue;
      }
      if ((token = this.code(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.text;
          this.inlineQueue.at(-1).src = last.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if ((token = this.fences(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.heading(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.hr(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.blockquote(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.list(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.html(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.def(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.raw;
          this.inlineQueue.at(-1).src = last.text;
        } else {
          if (!this.links[token.tag]) this.links[token.tag] = { href: token.href, title: token.title };
          tokens.push(token);
        }
        continue;
      }
      if ((token = this.table(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.lheading(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if (this.state.top && (token = this.paragraph(src))) {
        const last = tokens.at(-1);
        if (lastParagraphClipped && last?.type === 'paragraph') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = last.text;
        } else {
          tokens.push(token);
        }
        lastParagraphClipped = false;
        src = src.substring(token.raw.length);
        continue;
      }
      if ((token = this.text(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = last.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) { infiniteLoop(src.charCodeAt(0)); break; }
    }
    this.state.top = true;
    return tokens;
  }

  // ----- inline tokenizers -----

  escape(src) {
    const cap = iEscape.exec(src);
    if (cap) return { type: 'escape', raw: cap[0], text: cap[1] };
  }

  tag(src) {
    const cap = iTag.exec(src);
    if (cap) {
      const state = this.state;
      if (!state.inLink && other.startATag.test(cap[0])) state.inLink = true;
      else if (state.inLink && other.endATag.test(cap[0])) state.inLink = false;
      if (!state.inRawBlock && other.startPreScriptTag.test(cap[0])) state.inRawBlock = true;
      else if (state.inRawBlock && other.endPreScriptTag.test(cap[0])) state.inRawBlock = false;
      return { type: 'html', raw: cap[0], inLink: state.inLink, inRawBlock: state.inRawBlock, block: false, text: cap[0] };
    }
  }

  labelHasRawTag(src, label, offset) {
    if (!label.includes('<')) return false;
    for (let i = 0; i < label.length; i++) {
      if (label[i] === '\\') { i++; continue; }
      if (label[i] === '`') {
        const code = iCode.exec(label.slice(i));
        if (code) { i += code[0].length - 1; continue; }
      }
      if (label[i] !== '<') continue;
      const rest = src.slice(offset + i);
      const m = iTag.exec(rest) || iAutolink.exec(rest);
      if (m) {
        if (m[0].length > label.length - i) return true;
        i += m[0].length - 1;
      }
    }
    return false;
  }

  outputLink(cap, link, raw) {
    const href = link.href;
    const title = link.title || null;
    const text = cap[1].replace(other.outputLinkReplace, '$1');
    const isImage = cap[0].charAt(0) === '!';
    const state = this.state;
    const prevInLink = state.inLink;
    const prevEmitted = state.linkEmitted;
    const prevRaw = state.inRawBlock;
    state.inLink = true;
    state.linkEmitted = false;
    const tokens = this.inlineTokens(text);
    const emitted = state.linkEmitted;
    state.linkEmitted = prevEmitted;
    state.inLink = prevInLink;
    if (!isImage) {
      if (emitted) { state.inRawBlock = prevRaw; return; }
      state.linkEmitted = true;
    }
    return { type: isImage ? 'image' : 'link', raw, href, title, text, tokens };
  }

  link(src) {
    if (this.state.linkParenPossible === false) return;
    const cap = iLink.exec(src);
    if (!cap) return;
    const offset = cap[0].charAt(0) === '!' ? 2 : 1;
    if (this.labelHasRawTag(src, cap[1], offset)) return;
    const trimmedUrl = cap[2].trim();
    if (other.startAngleBracket.test(trimmedUrl)) {
      if (!other.endAngleBracket.test(trimmedUrl)) return;
      const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), '\\');
      if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) return;
    } else {
      const lastParen = findClosingBracket(cap[2], '()');
      if (lastParen === -2) return;
      if (lastParen > -1) {
        const start = cap[0].indexOf('!') === 0 ? 5 : 4;
        const linkLen = start + cap[1].length + lastParen;
        cap[2] = cap[2].substring(0, lastParen);
        cap[0] = cap[0].substring(0, linkLen).trim();
        cap[3] = '';
      }
    }
    const rtrimmed = rtrim(cap[0].slice(0, -1), '\\');
    if ((cap[0].length - rtrimmed.length) % 2 === 0) return;
    let href = cap[2];
    const title = cap[3] ? cap[3].slice(1, -1) : '';
    href = href.trim();
    if (other.startAngleBracket.test(href)) href = href.slice(1, -1);
    return this.outputLink(cap, {
      href: href && href.replace(iAnyPunctuation, '$1'),
      title: title && title.replace(iAnyPunctuation, '$1'),
    }, cap[0]);
  }

  reflink(src, links) {
    let cap;
    if ((cap = iReflink.exec(src)) || (cap = iNolink.exec(src))) {
      const offset = cap[0].charAt(0) === '!' ? 2 : 1;
      if (this.labelHasRawTag(src, cap[1], offset)) return;
      const link = links[normalizeLabel(cap[2] || cap[1])];
      if (!link) {
        const t = cap[0].charAt(0);
        return { type: 'text', raw: t, text: t };
      }
      return this.outputLink(cap, link, cap[0]);
    }
  }

  closers(maskedSrc) {
    const stack = this.closerStack;
    let top = stack[stack.length - 1];
    if (top === null) stack[stack.length - 1] = top = closerIndexes(maskedSrc);
    return top;
  }

  emStrong(src, maskedSrc, prevChar = '') {
    let match = iEmStrongLDelim.exec(src);
    if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return;
    const lDelimChar = match[0][0];
    const sameAsPrev = prevChar === lDelimChar;
    const pos = maskedSrc.length - src.length;
    let runStart = pos;
    while (runStart > 0 && maskedSrc[runStart - 1] === lDelimChar) runStart--;
    const before = lastCodePointBefore(maskedSrc, runStart);
    const beforeIsPunct = before === '*' || before === '_' || !!iPunctuation.exec(before);
    if (runStart < pos) prevChar = before;
    const prevIsPunct = runStart < pos ? beforeIsPunct : !!iPunctuation.exec(prevChar);
    if (match[4] && prevChar.match(other.unicodeAlphaNumeric)) return;
    const nextChar = match[1] || match[3] || '';
    if (!nextChar || !prevChar || prevIsPunct) {
      const lLength = codePointCount(match[0]) - 1;
      let rDelim, rLength;
      let delimTotal = lLength;
      let midDelimTotal = 0;
      const runLength = pos - runStart + lLength;
      const leftFlankStrict = !!before.trim() && (!!nextChar || (lDelimChar === '*' && !beforeIsPunct));
      if (lDelimChar !== '*' && lDelimChar !== '_') return;
      const endReg = lDelimChar === '*' ? iEmStrongRDelimAst : iEmStrongRDelimUnd;
      const lastCloser = this.closers(maskedSrc).em[lDelimChar];
      const searchStart = maskedSrc.length - src.length + lLength;
      if (lastCloser < searchStart) return;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      const maxIndex = lastCloser - searchStart;
      endReg.lastIndex = 0;
      while ((match = endReg.exec(maskedSrc)) !== null && !(match.index > maxIndex)) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = rDelim.length; // ASCII run
        if (match[3] || match[4]) { delimTotal += rLength; continue; }
        else if (match[5] || match[6] || leftFlankStrict) {
          if (sameAsPrev && (match[5] || match[6])) break;
          if (runLength % 3 && !((runLength + rLength) % 3)) { midDelimTotal += rLength; continue; }
        }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = firstCodePointLength(match[0]);
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const text = raw.slice(1, -1);
          return { type: 'em', raw, text, tokens: this.inlineTokens(text) };
        }
        const text = raw.slice(2, -2);
        return { type: 'strong', raw, text, tokens: this.inlineTokens(text) };
      }
    }
  }

  codespan(src) {
    const cap = iCode.exec(src);
    if (cap) {
      let text = cap[2].replace(other.newLineCharGlobal, ' ');
      const hasNonSpace = other.nonSpaceChar.test(text);
      const bothSpace = other.startingSpaceChar.test(text) && other.endingSpaceChar.test(text);
      if (hasNonSpace && bothSpace) text = text.substring(1, text.length - 1);
      return { type: 'codespan', raw: cap[0], text };
    }
  }

  br(src) {
    const cap = iBr.exec(src);
    if (cap) return { type: 'br', raw: cap[0] };
  }

  del(src, maskedSrc, prevChar = '') {
    let match = iDelLDelim.exec(src);
    if (!match) return;
    const nextChar = match[1] || '';
    if (!nextChar || !prevChar || iPunctuation.exec(prevChar)) {
      const lLength = codePointCount(match[0]) - 1;
      let rDelim, rLength;
      let delimTotal = lLength;
      const lastCloser = this.closers(maskedSrc).del;
      const searchStart = maskedSrc.length - src.length + lLength;
      if (lastCloser < searchStart) return;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      const maxIndex = lastCloser - searchStart;
      iDelRDelim.lastIndex = 0;
      while ((match = iDelRDelim.exec(maskedSrc)) !== null && !(match.index > maxIndex)) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = rDelim.length;
        if (rLength !== lLength) continue;
        if (match[3] || match[4]) { delimTotal += rLength; continue; }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal);
        const lastCharLength = firstCodePointLength(match[0]);
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        const text = raw.slice(lLength, -lLength);
        return { type: 'del', raw, text, tokens: this.inlineTokens(text) };
      }
    }
  }

  autolink(src) {
    const cap = iAutolink.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === '@') { text = cap[1]; href = 'mailto:' + text; }
      else { text = cap[1]; href = text; }
      return { type: 'link', raw: cap[0], text, href, autolink: true, tokens: [{ type: 'text', raw: text, text }] };
    }
  }

  url(src) {
    const cap = iUrl.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === '@') {
        text = cap[0];
        href = 'mailto:' + text;
      } else {
        let prev;
        do {
          prev = cap[0];
          cap[0] = iBackpedal.exec(cap[0])?.[0] ?? '';
        } while (prev !== cap[0]);
        text = cap[0];
        href = cap[1] === 'www.' ? 'http://' + cap[0] : cap[0];
      }
      return { type: 'link', raw: cap[0], text, href, autolink: true, tokens: [{ type: 'text', raw: text, text }] };
    }
  }

  inlineText(src, rule) {
    const cap = rule.exec(src);
    if (cap) {
      const raw = this.state.inRawBlock;
      return { type: 'text', raw: cap[0], text: raw ? cap[0] : decodeNumericRefs(cap[0]), escaped: raw };
    }
  }

  linkInText(text) {
    if (!text.includes('[')) return false;
    for (const m of text.matchAll(iBlockSkip)) {
      if (iLink.test(m[0]) && text.charAt(m.index - 1) !== '!') return true;
    }
    for (const m of text.matchAll(iReflinkSearch)) {
      const s = m[0];
      const r = s.lastIndexOf('[');
      if (!(s.charAt(0) === '!' || !Object.hasOwn(this.links, normalizeLabel(s.slice(r + 1, -1))))
        && !(r > 1 && this.linkInText(s.slice(1, r - 1)))) return true;
    }
    return false;
  }

  inlineTokens(src, tokens = []) {
    const state = this.state;
    if (!notPlainRe.test(src)) {
      if (src) {
        const raw = state.inRawBlock;
        tokens.push({ type: 'text', raw: src, text: raw ? src : decodeNumericRefs(src), escaped: raw });
      }
      return tokens;
    }
    const prevParen = state.linkParenPossible;
    state.linkParenPossible = prevParen && src.includes(')');
    try {
      // mask and closer indexes are computed on first use by emStrong/del (lazily)
      this.closerStack.push(null);
      try {
        return this.inlineLoop(src, tokens);
      } finally {
        this.closerStack.pop();
      }
    } finally {
      state.linkParenPossible = prevParen;
    }
  }

  inlineLoop(src, tokens) {
    const fullSrc = src;
    let maskedSrc = null;
    let keepPrevChar = false;
    let prevChar = '';
    let minLen = Infinity;
    const textRule = pickTextRule(src);
    while (src) {
      if (src.length < minLen) minLen = src.length;
      else { infiniteLoop(src.charCodeAt(0)); break; }
      if (!keepPrevChar) prevChar = '';
      keepPrevChar = false;
      let token;
      const c0 = src.charCodeAt(0);
      if (c0 === 92 /* \ */ && (token = this.escape(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if (c0 === 60 /* < */ && (token = this.tag(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if (c0 === 91 /* [ */ || c0 === 33 /* ! */) {
        if ((token = this.link(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
        if ((token = this.reflink(src, this.links))) {
          src = src.substring(token.raw.length);
          const last = tokens.at(-1);
          if (token.type === 'text' && last?.type === 'text') { last.raw += token.raw; last.text += token.text; }
          else tokens.push(token);
          continue;
        }
      }
      if (c0 === 42 /* * */ || c0 === 95 /* _ */) {
        if (maskedSrc === null) maskedSrc = this.mask(fullSrc);
        if ((token = this.emStrong(src, maskedSrc, prevChar))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      }
      if (c0 === 96 /* ` */ && (token = this.codespan(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((c0 === 32 || c0 === 92) && (token = this.br(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if (c0 === 126 /* ~ */) {
        if (maskedSrc === null) maskedSrc = this.mask(fullSrc);
        if ((token = this.del(src, maskedSrc, prevChar))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      }
      if (c0 === 60 && (token = this.autolink(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if (urlStart(c0) && !this.state.inLink && (token = this.url(src))) { src = src.substring(token.raw.length); tokens.push(token); continue; }
      if ((token = this.inlineText(src, textRule))) {
        src = src.substring(token.raw.length);
        if (token.raw.slice(-1) !== '_') prevChar = token.raw.slice(-1);
        keepPrevChar = true;
        const last = tokens.at(-1);
        if (last?.type === 'text') { last.raw += token.raw; last.text += token.text; }
        else tokens.push(token);
        continue;
      }
      if (src) { infiniteLoop(src.charCodeAt(0)); break; }
    }
    return tokens;
  }

  mask(src) {
    let masked = src;
    if (src.includes('[')) {
      const replacer = (m) => {
        const r = m.lastIndexOf('[');
        if (!Object.hasOwn(this.links, normalizeLabel(m.slice(r + 1, -1)))) return m;
        if (r > 1 && m.charAt(0) !== '!') {
          const inner = m.slice(1, r - 1);
          if (this.linkInText(inner)) return '[' + inner.replace(iReflinkSearch, replacer) + '][' + 'a'.repeat(m.length - r - 2) + ']';
        }
        return '[' + 'a'.repeat(m.length - 2) + ']';
      };
      masked = masked.replace(iReflinkSearch, replacer);
    }
    // identity unless an escape or a code span is present
    if (masked.includes('\\') || masked.includes('`')) {
      masked = masked.replace(iAnyPunctuationOutsideCode, (m, ticks, punct) =>
        punct ? '+'.repeat(m.length) : ticks ? ticks + m.slice(ticks.length, -ticks.length).replace(/`/g, '+') + ticks : m);
    }
    // blockSkip needs a link '[', a code span '`' or a tag '<'
    if (masked.includes('[') || masked.includes('`') || masked.includes('<')) {
      masked = masked.replace(iBlockSkip, (m, a, pre) => {
        const keep = pre ? pre.length : 0;
        return m.slice(0, keep) + '[' + 'a'.repeat(m.length - keep - 2) + ']';
      });
    }
    return masked;
  }
}

// First characters the gfm url rule can start with: [A-Za-z0-9._+-]
function urlStart(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 46 || c === 95 || c === 43 || c === 45;
}

// An inline source with none of these can only lex to a single text token.
const notPlainRe = /[\\<!\[`*_~@:]|www\.| {2}\n/;

function infiniteLoop(code) {
  throw new Error('Infinite loop on byte: ' + code + '\nPlease report this to https://github.com/markedjs/marked.');
}

// ---------------------------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------------------------

function renderBlocks(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'space': break;
      case 'hr': out += '<hr>\n'; break;
      case 'heading': out += `<h${t.depth}>${renderInline(t.tokens)}</h${t.depth}>\n`; break;
      case 'code': out += renderCode(t); break;
      case 'table': out += renderTable(t); break;
      case 'blockquote': out += `<blockquote>\n${renderBlocks(t.tokens)}</blockquote>\n`; break;
      case 'list': out += renderList(t); break;
      case 'checkbox': out += renderCheckbox(t); break;
      case 'html': out += t.text; break;
      case 'def': break;
      case 'paragraph': out += `<p>${renderInline(t.tokens)}</p>\n`; break;
      case 'text': out += renderText(t); break;
      default: throw new Error('Token with "' + t.type + '" type was not found.\nPlease report this to https://github.com/markedjs/marked.');
    }
  }
  return out;
}

function renderCode(t) {
  const lang = (t.lang || '').match(other.notSpaceStart)?.[0];
  const code = t.text ? t.text.replace(other.endingNewline, '') + '\n' : '';
  return lang
    ? '<pre><code class="language-' + escapeHtml(lang) + '">' + escapeHtml(code, true) + '</code></pre>\n'
    : '<pre><code>' + escapeHtml(code, true) + '</code></pre>\n';
}

function renderList(t) {
  let body = '';
  for (let i = 0; i < t.items.length; i++) body += `<li>${renderBlocks(t.items[i].tokens)}</li>\n`;
  const tag = t.ordered ? 'ol' : 'ul';
  const start = t.ordered && t.start !== 1 ? ' start="' + t.start + '"' : '';
  return '<' + tag + start + '>\n' + body + '</' + tag + '>\n';
}

function renderCheckbox(t) {
  return '<input ' + (t.checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
}

function renderCell(cell) {
  const content = renderInline(cell.tokens);
  const tag = cell.header ? 'th' : 'td';
  return (cell.align ? `<${tag} align="${cell.align}">` : `<${tag}>`) + content + `</${tag}>\n`;
}

function renderTable(t) {
  let cells = '';
  for (let i = 0; i < t.header.length; i++) cells += renderCell(t.header[i]);
  const header = `<tr>\n${cells}</tr>\n`;
  let body = '';
  for (let r = 0; r < t.rows.length; r++) {
    const row = t.rows[r];
    cells = '';
    for (let i = 0; i < row.length; i++) cells += renderCell(row[i]);
    body += `<tr>\n${cells}</tr>\n`;
  }
  if (body) body = `<tbody>${body}</tbody>`;
  return '<table>\n<thead>\n' + header + '</thead>\n' + body + '</table>\n';
}

function renderText(t) {
  return 'tokens' in t && t.tokens ? renderInline(t.tokens) : 'escaped' in t && t.escaped ? t.text : escapeHtml(t.text);
}

function renderLink(t) {
  const text = t.autolink ? escapeHtml(t.text, true) : renderInline(t.tokens);
  const href = cleanUrl(t.href);
  if (href === null) return text;
  let out = '<a href="' + escapeHtml(href, t.autolink) + '"';
  if (t.title) out += ' title="' + escapeHtml(t.title) + '"';
  out += '>' + text + '</a>';
  return out;
}

function renderImage(t) {
  let text = t.text;
  if (t.tokens) text = renderPlain(t.tokens);
  const href = cleanUrl(t.href);
  if (href === null) return escapeHtml(text);
  let out = `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"`;
  if (t.title) out += ` title="${escapeHtml(t.title)}"`;
  out += '>';
  return out;
}

function renderInline(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'escape': out += renderText(t); break;
      case 'html': out += t.text; break;
      case 'link': out += renderLink(t); break;
      case 'image': out += renderImage(t); break;
      case 'checkbox': out += renderCheckbox(t); break;
      case 'strong': out += `<strong>${renderInline(t.tokens)}</strong>`; break;
      case 'em': out += `<em>${renderInline(t.tokens)}</em>`; break;
      case 'codespan': out += `<code>${escapeHtml(t.text, true)}</code>`; break;
      case 'br': out += '<br>'; break;
      case 'del': out += `<del>${renderInline(t.tokens)}</del>`; break;
      case 'text': out += renderText(t); break;
      default: throw new Error('Token with "' + t.type + '" type was not found.\nPlease report this to https://github.com/markedjs/marked.');
    }
  }
  return out;
}

// marked's TextRenderer, used for image alt text
function renderPlain(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'escape': case 'html': case 'text': case 'codespan': out += t.text; break;
      case 'link': case 'image': case 'strong': case 'em': case 'del': out += t.tokens ? renderPlain(t.tokens) : t.text; break;
      case 'checkbox': out += t.raw; break;
      case 'br': break;
      default: throw new Error('Token with "' + t.type + '" type was not found.\nPlease report this to https://github.com/markedjs/marked.');
    }
  }
  return out;
}

export function parse(markdown) {
  return renderBlocks(new Lexer().lex(markdown));
}

export default parse;

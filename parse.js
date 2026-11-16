// parse.js - a gfm-only specialization of marked 18.1.3 (MIT, see LICENSE and NOTICE).
// parse(markdown) returns exactly what marked.parse(markdown) returns with marked's default options
// (gfm: true, breaks: false, pedantic: false, async: false, no extensions, no hooks).
// Regexes are composed at load time with marked's own edit()/caret logic so their sources match marked's.

// ---------------------------------------------------------------------------------------------------
// Regex composition (marked's `edit`)
// ---------------------------------------------------------------------------------------------------
const caret = /(^|[^\[])\^/g;
function edit(regex, opt = '') {
  let source = typeof regex === 'string' ? regex : regex.source;
  const obj = {
    replace(name, val) {
      let valSource = typeof val === 'string' ? val : val.source;
      valSource = valSource.replace(caret, '$1');
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex() {
      return new RegExp(source, opt);
    },
  };
  return obj;
}

// "other" helper regexes
const reCodeRemoveIndent = /^(?: {0,3}\t| {1,4})/gm;
const reOutputLinkReplace = /\\([\[\]])/g;
const reIndentCodeCompensation = /^(\s+)(?:```)/;
const reBeginningSpace = /^\s+/;
const reEndingHash = /#$/;
const reStartingSpaceChar = /^ /;
const reEndingSpaceChar = / $/;
const reEndingSpaceTabChar = /[ \t]$/;
const reNonSpaceChar = /[^ ]/;
const reNewLineCharGlobal = /\n/g;
const reTabCharGlobal = /\t/g;
const reLeadingSpaceTab = /^[ \t]+/;
const reMultipleSpaceGlobal = /\s+/g;
const reBlankLine = /^[ \t]*$/;
const reDoubleBlankLine = /\n[ \t]*\n[ \t]*$/;
const reBlockquoteStart = /^ {0,3}>/;
const reBlockquoteSetextReplace = /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g;
const reBlockquoteSetextReplace2 = /^ {0,3}>[ \t]?/gm;
const reBlockquoteMarkerWhitespace = /^( {0,3}>)([ \t]+)/gm;
const reListIsTask = /^\[[ xX]\][ \t]+\S/;
const reListReplaceTask = /^\[[ xX]\][ \t]+/;
const reListTaskCheckbox = /\[[ xX]\]/;
const reAnyLine = /\n.*\n/;
const reHrefBrackets = /^<(.*)>$/;
const reTableDelimiter = /[:|]/;
const reTableAlignChars = /^\||\| *$/g;
const reTableRowBlankLine = /\n[ \t]*$/;
const reTableAlignRight = /^ *-+: *$/;
const reTableAlignCenter = /^ *:-+: *$/;
const reTableAlignLeft = /^ *:-+ *$/;
const reStartATag = /^<a /i;
const reEndATag = /^<\/a>/i;
const reStartPreScriptTag = /^<(pre|code|kbd|script)(\s|>)/i;
const reEndPreScriptTag = /^<\/(pre|code|kbd|script)(\s|>)/i;
const reStartAngleBracket = /^</;
const reEndAngleBracket = />$/;
const reUnicodeAlphaNumeric = /[\p{L}\p{N}]/u;
const reNumericCharacterReference = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/;
const reNumericCharacterReferenceOrAmpersand = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
const reEscapeTest = /[&<>"']/;
const reEscapeReplace = /[&<>"']/g;
const reEscapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const reEscapeReplaceNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
const rePercentDecode = /%25/g;
const reFindPipe = /\|/g;
const reSplitPipe = / \|/;
const reSlashPipe = /\\\|/g;
const reCarriageReturn = /\r\n|\r/g;
const reNotSpaceStart = /^\S*/;
const reEndingNewline = /\n$/;
const reSetextUnderline = /^ {0,3}(?:=+|-+) *$/;
const reLeadingUpTo3Spaces = /^ {0,3}/;
const reLeadingNewline = /^\n/;
const reBacktickGlobal = /`/g;

// Per-indent regex builders, memoized by clamped indent like marked's D()
function memoIndent(build) {
  const cache = [];
  return (indent) => {
    const n = Math.max(0, Math.min(3, indent - 1));
    let re = cache[n];
    if (!re) {
      re = build(n);
      cache[n] = re;
    }
    return re;
  };
}
const listItemRegex = (bull) => new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`);
const nextBulletRegex = memoIndent((n) => new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`));
const hrRegex = memoIndent((n) => new RegExp(`^ {0,${n}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`));
const fencesBeginRegex = memoIndent((n) => new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`));
const headingBeginRegex = memoIndent((n) => new RegExp(`^ {0,${n}}#{1,6}(?:\\s|$)`));
const htmlBeginRegex = memoIndent((n) => new RegExp(`^ {0,${n}}(?:</?(?:${blockTags})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i'));
const blockquoteBeginRegex = memoIndent((n) => new RegExp(`^ {0,${n}}>`));

// ---------------------------------------------------------------------------------------------------
// Block rules (marked's gfm block grammar)
// ---------------------------------------------------------------------------------------------------
const blockTags = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const bNewline = /^(?:[ \t]*(?:\n|$))+/;
const bCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const bFences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const bHr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const bHeading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const bBullet = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/;
const bLheading = edit(lheadingCore)
  .replace(/bull/g, bBullet)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/)
  .getRegex();
const paragraphCore = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const bText = /^[^\n]+/;
const refLabel = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const bDef = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .replace('label', refLabel)
  .replace('title', /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/)
  .getRegex();
const bList = edit(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, bBullet).getRegex();
const htmlComment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const bHtml = edit('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))', 'i')
  .replace('comment', htmlComment)
  .replace('tag', blockTags)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
  .getRegex();
const blockquoteParagraph = edit(paragraphCore)
  .replace('hr', bHr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('|table', '')
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', / {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/)
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', blockTags)
  .getRegex();
const bBlockquote = edit(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/).replace('paragraph', blockquoteParagraph).getRegex();
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
const bParagraph = edit(paragraphCore)
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

// ---------------------------------------------------------------------------------------------------
// Inline rules (marked's gfm inline grammar)
// ---------------------------------------------------------------------------------------------------
const iEscape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
const iCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const iBr = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const rePunct = /[\p{P}\p{S}]/u;
const rePunctSpace = /[\s\p{P}\p{S}]/u;
const reNotPunctSpace = /[^\s\p{P}\p{S}]/u;
const iPunctuation = edit(/^((?![*_])punctSpace)/, 'u').replace(/punctSpace/g, rePunctSpace).getRegex();
const rePunctGfm = /(?!~)[\p{P}\p{S}]/u;
const rePunctSpaceGfm = /(?!~)[\s\p{P}\p{S}]/u;
const reNotPunctSpaceGfm = /(?:[^\s\p{P}\p{S}]|~)/u;
const iBlockSkip = edit(/link|precode-code|html/, 'g')
  .replace('link', /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/)
  .replace('precode-', '(?<!`)()')
  .replace('code', /(?<b>`+)[^`]+\k<b>(?!`)/)
  .replace('html', /<(?! )[^<>]*?>/)
  .getRegex();
const emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
const iEmStrongLDelim = edit(emStrongLDelimCore, 'u').replace(/punct/g, rePunctGfm).getRegex();
const emStrongRDelimAstCore = '^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)';
const iEmStrongRDelimAst = edit(emStrongRDelimAstCore, 'gu')
  .replace(/notPunctSpace/g, reNotPunctSpaceGfm)
  .replace(/punctSpace/g, rePunctSpaceGfm)
  .replace(/punct/g, rePunctGfm)
  .getRegex();
const iEmStrongRDelimUnd = edit('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)', 'gu')
  .replace(/notPunctSpace/g, reNotPunctSpace)
  .replace(/punctSpace/g, rePunctSpace)
  .replace(/punct/g, rePunct)
  .getRegex();
const iDelLDelim = edit(/^~~?(?:((?!~)punct)|[^\s~])/, 'u').replace(/punct/g, rePunct).getRegex();
const iDelRDelim = edit('^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)', 'gu')
  .replace(/notPunctSpace/g, reNotPunctSpace)
  .replace(/punctSpace/g, rePunctSpace)
  .replace(/punct/g, rePunct)
  .getRegex();
const iAnyPunctuation = edit(/\\(punct)/, 'gu').replace(/punct/g, rePunct).getRegex();
const iAnyPunctuationOutsideCode = edit(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu').replace(/punct/g, rePunct).getRegex();
const iAutolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
  .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/)
  .getRegex();
const inlineComment = edit(htmlComment).replace('(?:-->|$)', '-->').getRegex();
const iTag = edit('^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>')
  .replace('comment', inlineComment)
  .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/)
  .getRegex();
const linkBrackets = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const linkLabel = edit(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace('brackets', linkBrackets).getRegex();
const iLink = edit(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .replace('label', linkLabel)
  .replace('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .replace('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/)
  .getRegex();
const iReflink = edit(/^!?\[(label)\]\[(ref)\]/).replace('label', linkLabel).replace('ref', refLabel).getRegex();
const iNolink = edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', refLabel).getRegex();
const refLabelShort = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const linkLabelShort = edit(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace('brackets', linkBrackets).getRegex();
const iReflinkSearch = edit('reflink|nolink(?!\\()', 'g')
  .replace('reflink', edit(/^!?\[(label)\]\[(ref)\]/).replace('label', linkLabelShort).replace('ref', refLabelShort).getRegex())
  .replace('nolink', edit(/^!?\[(ref)\](?:\[\])?/).replace('ref', refLabelShort).getRegex())
  .getRegex();
const urlProtocol = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const urlEmail = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const urlEmailProtocol = edit(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, urlEmail).getRegex();
const iUrl = edit(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .replace('emailProtocol', urlEmailProtocol)
  .replace('protocol', urlProtocol)
  .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/)
  .getRegex();
const iBackpedal = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const iText = edit(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .replace('protocol', urlProtocol)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', '(?<![^\\s*_~(])www\\.')
  .getRegex();

// R5/R6: the text rule without branches that cannot match. Without '@' the email lookaheads never
// match; without ':' and 'www.' neither do the protocol/www/mailto branches.
const iTextNoEmail = /^(?:[^a-zA-Z0-9](?=(?:mailto|xmpp):)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|(?<![^\s*_~(])www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=(?:mailto|xmpp):))))/;
const iTextPlain = /^(?:(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|$)|[^ ](?= {2,}\n))))/;
// R3: any of these means the source is not a single plain text token.
const rePlainBreaker = /[\\<!\[`*_~:@]|  \n|www\./;

// Exposed for the dev-time identity check against marked's composed rules (not used by parse()).
export const variants = { textNoEmail: iTextNoEmail, textPlain: iTextPlain, plainBreaker: rePlainBreaker };
export const rules = {
  block: { newline: bNewline, code: bCode, fences: bFences, hr: bHr, heading: bHeading, blockquote: bBlockquote, list: bList, html: bHtml, def: bDef, table: bTable, lheading: bLheading, paragraph: bParagraph, text: bText },
  inline: { escape: iEscape, tag: iTag, link: iLink, reflink: iReflink, nolink: iNolink, reflinkSearch: iReflinkSearch, emStrongLDelim: iEmStrongLDelim, emStrongRDelimAst: iEmStrongRDelimAst, emStrongRDelimUnd: iEmStrongRDelimUnd, code: iCode, br: iBr, delLDelim: iDelLDelim, delRDelim: iDelRDelim, autolink: iAutolink, url: iUrl, _backpedal: iBackpedal, text: iText, punctuation: iPunctuation, blockSkip: iBlockSkip, anyPunctuation: iAnyPunctuation, anyPunctuationOutsideCode: iAnyPunctuationOutsideCode },
};

// ---------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeChar = (ch) => escapeMap[ch];
function escape(html, encode) {
  if (encode) {
    if (reEscapeTest.test(html)) return html.replace(reEscapeReplace, escapeChar);
  } else if (reEscapeTestNoEncode.test(html)) {
    return html.replace(reEscapeReplaceNoEncode, escapeChar);
  }
  return html;
}

function unescapeNumeric(text) {
  if (!reNumericCharacterReference.test(text)) return text;
  return text.replace(reNumericCharacterReferenceOrAmpersand, (_, dec, hex) => {
    if (dec === undefined && hex === undefined) return '&amp;';
    const cp = dec === undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    if (cp === 0 || cp > 1114111 || (cp >= 55296 && cp <= 57343)) return '\uFFFD';
    if (cp === 38) return '&amp;';
    return String.fromCodePoint(cp);
  });
}

// N7: characters encodeURI leaves alone, plus '%' (encoded to %25, which the %25 -> % step restores)
const reUrlSafe = /^[\w\-.!~*'();/?:@&=+$,#%]*$/;
function cleanUrl(href) {
  if (reUrlSafe.test(href)) return href;
  try {
    href = encodeURI(href).replace(rePercentDecode, '%');
  } catch {
    return null;
  }
  return href;
}

// marked's .replace(anyPunctuation, '$1'); without a backslash there is nothing to replace
function unescapePunct(s) {
  return s.includes('\\') ? s.replace(iAnyPunctuation, '$1') : s;
}

function splitCells(tableRow, count) {
  const row = tableRow.replace(reFindPipe, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === '\\') escaped = !escaped;
    return escaped ? '|' : ' |';
  });
  const cells = row.split(reSplitPipe);
  let i = 0;
  if (!cells[0].trim()) cells.shift();
  if (cells.length > 0 && !cells.at(-1)?.trim()) cells.pop();
  if (count) {
    if (cells.length > count) cells.splice(count);
    else while (cells.length < count) cells.push('');
  }
  for (; i < cells.length; i++) cells[i] = cells[i].trim().replace(reSlashPipe, '|');
  return cells;
}

// Remove trailing `c` characters (marked's rtrim without invert).
function rtrim(str, c) {
  const l = str.length;
  if (l === 0) return '';
  let suffLen = 0;
  while (suffLen < l && str.charAt(l - suffLen - 1) === c) suffLen++;
  return str.slice(0, l - suffLen);
}

function trimTrailingBlankLines(str) {
  const lines = str.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && reBlankLine.test(lines[i])) i--;
  return lines.length - i <= 2 ? str : lines.slice(0, i + 1).join('\n');
}

function normalizeLabel(label) {
  return label.trim().replace(reMultipleSpaceGlobal, ' ').toLowerCase().toUpperCase().toLowerCase();
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

// Last index where an emphasis/strikethrough closer could start (marked's fe()).
function closerIndexes(src) {
  const em = { '*': -1, _: -1 };
  let del = -1;
  const n = src.length;
  for (let s = 0; s < n; s++) {
    const ch = src[s];
    if (ch !== '*' && ch !== '_' && ch !== '~') continue;
    const prev = s === 0 ? '\n' : src[s - 1];
    let i = s + 1;
    while (i < n && src[i] === ch) i++;
    if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r' && prev !== '\f') {
      if (ch === '~') del = s;
      else em[ch] = s;
    }
    s = i - 1;
  }
  return { em, del };
}

function firstLine(s) {
  const i = s.indexOf('\n');
  return i < 0 ? s : s.slice(0, i);
}

// [...s.slice(max(0, i - 2), i)].at(-1) ?? '' without allocating an array
function lastCodePointBefore(s, i) {
  if (i === 0) return '';
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
    const hi = s.charCodeAt(i - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(i - 2, i);
  }
  return s.charAt(i - 1);
}

// [...s][0].length
function firstCodePointLength(s) {
  const hi = s.charCodeAt(0);
  if (hi >= 0xd800 && hi <= 0xdbff && s.length > 1) {
    const lo = s.charCodeAt(1);
    if (lo >= 0xdc00 && lo <= 0xdfff) return 2;
  }
  return 1;
}

// first characters the gfm url rule can start with: [A-Za-z0-9._+-]
function isUrlStart(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 46 || c === 95 || c === 43 || c === 45;
}

// N1: necessary condition for the setext-heading rule. Its underline is a line ` {0,3}(=+|-+)[ \t]*`
// after the first line, and its content cannot cross a newline followed by a [ \t]*-only line.
function maySetext(src) {
  const n = src.length;
  let i = src.indexOf('\n');
  while (i !== -1) {
    let j = i + 1;
    let sp = 0;
    while (sp < 4 && src.charCodeAt(j) === 32) {
      j++;
      sp++;
    }
    const c = src.charCodeAt(j);
    if (sp < 4 && (c === 61 || c === 45)) {
      do j++;
      while (src.charCodeAt(j) === c);
      while (src.charCodeAt(j) === 32 || src.charCodeAt(j) === 9) j++;
      if (j >= n || src.charCodeAt(j) === 10) return true;
    }
    // stop at a blank ([ \t]*) line
    j = i + 1;
    while (src.charCodeAt(j) === 32 || src.charCodeAt(j) === 9) j++;
    if (j >= n || src.charCodeAt(j) === 10) return false;
    i = src.indexOf('\n', j);
  }
  return false;
}

// N4: the gfm table rule needs a second line starting, after up to 3 spaces, with | : or -
function mayTable(src) {
  let j = src.indexOf('\n') + 1;
  if (j === 0) return false;
  const e = j + 3;
  while (j < e && src.charCodeAt(j) === 32) j++;
  const c = src.charCodeAt(j);
  return c === 124 || c === 58 || c === 45;
}

function expandTabs(str, col = 0) {
  let c = col;
  let out = '';
  for (const ch of str) {
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
  const m = raw.match(reIndentCodeCompensation);
  if (m === null) return text;
  const indent = m[1];
  return text
    .split('\n')
    .map((line) => {
      const ws = line.match(reBeginningSpace);
      if (ws === null) return line;
      const [w] = ws;
      return line.slice(Math.min(w.length, indent.length));
    })
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------------------------------
class Lexer {
  constructor() {
    this.tokens = [];
    this.links = Object.create(null);
    this.inlineQueue = [];
    this.state = { inLink: false, inRawBlock: false, linkEmitted: false, linkParenPossible: true, top: true };
    this.hasLinks = false;
  }

  lex(src) {
    src = src.replace(reCarriageReturn, '\n');
    this.blockTokens(src, this.tokens);
    const q = this.inlineQueue;
    for (let i = 0; i < q.length; i++) {
      const slot = q[i];
      this.state.inRawBlock = false;
      slot.html = this.inlineTokens(slot.src, false);
    }
    this.inlineQueue = [];
    return this.tokens;
  }

  // N2: block tokens hold an inline slot; the inline pass writes the slot's HTML directly.
  inline(src) {
    const slot = { src, html: '', pre: '' };
    this.inlineQueue.push(slot);
    return slot;
  }

  // ----- block level -----
  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    let maxLen = Infinity;
    let token;
    while (src) {
      if (src.length < maxLen) maxLen = src.length;
      else throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));

      // N4: dispatch on the first character (after up to 3 spaces); each skipped rule cannot match.
      const c0 = src.charCodeAt(0);
      let j = 0;
      while (j < 3 && src.charCodeAt(j) === 32) j++;
      const c = src.charCodeAt(j);
      if ((c0 === 32 || c0 === 9 || c0 === 10) && (token = this.space(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (token.raw.length === 1 && last !== undefined) last.raw += '\n';
        else tokens.push(token);
        continue;
      }
      if ((c0 === 32 || c0 === 9) && (token = this.code(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.text;
          this.inlineQueue.at(-1).src = last.text;
        } else tokens.push(token);
        continue;
      }
      if ((c === 96 || c === 126) && (token = this.fences(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (c === 35 && (token = this.heading(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if ((c === 45 || c === 95 || c === 42) && (token = this.hr(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (c === 62 && (token = this.blockquote(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if ((c === 42 || c === 43 || c === 45 || (c >= 48 && c <= 57)) && (token = this.list(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (c === 60 && (token = this.html(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (c === 91 && (token = this.def(src))) {
        src = src.substring(token.raw.length);
        const last = tokens.at(-1);
        if (last?.type === 'paragraph' || last?.type === 'text') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.raw;
          this.inlineQueue.at(-1).src = last.text;
        } else {
          if (!this.links[token.tag]) {
            this.links[token.tag] = { href: token.href, title: token.title };
            this.hasLinks = true;
          }
          tokens.push(token);
        }
        continue;
      }
      if (mayTable(src) && (token = this.table(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if ((token = this.lheading(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (this.state.top && (token = this.paragraph(src))) {
        const last = tokens.at(-1);
        if (lastParagraphClipped && last?.type === 'paragraph') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + token.raw;
          last.text += '\n' + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = last.text;
        } else tokens.push(token);
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
        } else tokens.push(token);
        continue;
      }
      if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
    this.state.top = true;
    return tokens;
  }

  space(src) {
    const cap = bNewline.exec(src);
    if (cap && cap[0].length > 0) return { type: 'space', raw: cap[0] };
  }

  code(src) {
    const cap = bCode.exec(src);
    if (cap) {
      const raw = trimTrailingBlankLines(cap[0]);
      return { type: 'code', raw, codeBlockStyle: 'indented', text: raw.replace(reCodeRemoveIndent, '') };
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
      if (reEndingHash.test(text)) {
        const trimmed = rtrim(text, '#');
        if (!trimmed || reEndingSpaceTabChar.test(trimmed)) text = trimmed.trim();
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
        if (reBlockquoteStart.test(lines[i])) {
          currentLines.push(lines[i]);
          inBlockquote = true;
        } else if (!inBlockquote) currentLines.push(lines[i]);
        else break;
      }
      lines = lines.slice(i);
      const currentRaw = currentLines.join('\n');
      const currentText = currentRaw
        .replace(reBlockquoteMarkerWhitespace, (_, marker, ws) => marker + expandTabs(ws, marker.length))
        .replace(reBlockquoteSetextReplace, '\n    $1')
        .replace(reBlockquoteSetextReplace2, '');
      raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
      text = text ? `${text}\n${currentText}` : currentText;
      const top = this.state.top;
      this.state.top = true;
      this.blockTokens(currentText, tokens, true);
      this.state.top = top;
      if (lines.length === 0) break;
      const lastToken = tokens.at(-1);
      const lt = lastToken?.type;
      if (lt === 'code' || lt === 'heading' || lt === 'hr' || lt === 'html' || lt === 'table') break;
      if (lt === 'blockquote') {
        const oldToken = lastToken;
        const newText = oldToken.raw + '\n' + lines.join('\n').replace(reBlockquoteSetextReplace2, '');
        const newToken = this.blockquote(newText);
        tokens[tokens.length - 1] = newToken;
        const rest = newText.substring(newToken.raw.length).replace(reLeadingNewline, '');
        const restLines = rest ? rest.split('\n').length : 0;
        const consumed = restLines ? lines.slice(0, -restLines) : lines;
        if (consumed.length > 0) raw = `${raw}\n${consumed.join('\n')}`;
        text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
        lines = lines.slice(consumed.length);
        if (lines.length > 0 && reBlockquoteStart.test(lines[0])) continue;
        break;
      } else if (lt === 'list') {
        const oldToken = lastToken;
        const newText = oldToken.raw + '\n' + lines.join('\n');
        const newToken = this.list(newText);
        tokens[tokens.length - 1] = newToken;
        const n = newToken.raw.length > oldToken.raw.length ? newText.slice(oldToken.raw.length + 1, newToken.raw.length).split('\n').length : 0;
        if (n > 0) {
          const added = lines.slice(0, n).join('\n');
          raw = `${raw}\n${added}`;
          text = `${text}\n${added}`;
        }
        lines = lines.slice(n);
        continue;
      }
    }
    return { type: 'blockquote', raw, tokens, text };
  }

  list(src) {
    let cap = bList.exec(src);
    if (!cap) return;
    const fullSrc = src;
    const consumed = () => fullSrc.length - src.length;
    let bull = cap[1].trim();
    const isOrdered = bull.length > 1;
    const list = { type: 'list', raw: '', ordered: isOrdered, start: isOrdered ? +bull.slice(0, -1) : '', loose: false, items: [] };
    bull = isOrdered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
    const itemRegex = listItemRegex(bull);
    let endsWithBlankLine = false;
    while (src) {
      let endEarly = false;
      let itemContents = '';
      if (!(cap = itemRegex.exec(src)) || bHr.test(src)) break;
      const start = consumed();
      src = src.substring(cap[0].length);
      const line = firstLine(cap[2]);
      const indent = cap[1].length;
      let lineExp = line.includes('\t') ? line.replace(reLeadingSpaceTab, (t) => expandTabs(t, indent)) : line;
      let nextLine = firstLine(src);
      let blankLine = !lineExp.trim();
      let itemIndent = 0;
      if (blankLine) itemIndent = indent + 1;
      else {
        itemIndent = lineExp.search(reNonSpaceChar);
        itemIndent = itemIndent > 4 ? 1 : itemIndent;
        itemContents = lineExp.slice(itemIndent);
        itemIndent += indent;
      }
      if (blankLine && reBlankLine.test(nextLine)) {
        src = src.substring(nextLine.length + 1);
        endEarly = true;
      }
      if (!endEarly) {
        const nextBullet = nextBulletRegex(itemIndent);
        const hrRe = hrRegex(itemIndent);
        const fencesRe = fencesBeginRegex(itemIndent);
        const headingRe = headingBeginRegex(itemIndent);
        const htmlRe = htmlBeginRegex(itemIndent);
        const bqRe = blockquoteBeginRegex(itemIndent);
        while (src) {
          const rawLine = firstLine(src);
          nextLine = rawLine;
          const nextLineExp = nextLine.includes('\t') ? nextLine.replace(reLeadingSpaceTab, (t) => expandTabs(t)) : nextLine;
          if (fencesRe.test(nextLine) || headingRe.test(nextLine) || htmlRe.test(nextLine) || bqRe.test(nextLine) || nextBullet.test(nextLine) || hrRe.test(nextLine)) break;
          if (nextLineExp.search(reNonSpaceChar) >= itemIndent || !nextLine.trim()) {
            itemContents += '\n' + nextLineExp.slice(itemIndent);
          } else {
            if (blankLine || (lineExp.includes('\t') ? lineExp.replace(reTabCharGlobal, '    ') : lineExp).search(reNonSpaceChar) >= 4 || fencesRe.test(lineExp) || headingRe.test(lineExp) || htmlRe.test(lineExp) || hrRe.test(lineExp)) break;
            const add = reSetextUnderline.test(nextLine) && bLheading.test(`${lineExp}\n${nextLine}`) ? `    ${nextLineExp.replace(reLeadingUpTo3Spaces, '')}` : nextLine;
            itemContents += '\n' + add;
          }
          blankLine = !nextLine.trim();
          src = src.substring(rawLine.length + 1);
          lineExp = nextLineExp.slice(itemIndent);
        }
      }
      const raw = fullSrc.slice(start, consumed());
      if (!list.loose) {
        if (endsWithBlankLine) list.loose = true;
        else if (reDoubleBlankLine.test(raw)) endsWithBlankLine = true;
      }
      list.items.push({ type: 'list_item', raw, task: reListIsTask.test(itemContents), loose: false, text: itemContents, tokens: [] });
    }
    const lastItem = list.items.at(-1);
    if (!lastItem) return;
    lastItem.raw = lastItem.raw.trimEnd();
    lastItem.text = lastItem.text.trimEnd();
    list.raw = fullSrc.slice(0, consumed()).trimEnd();
    for (const item of list.items) {
      this.state.top = false;
      item.tokens = this.blockTokens(item.text, []);
      if (!list.loose) {
        const spacers = item.tokens.filter((t) => t.type === 'space');
        list.loose = spacers.length > 0 && spacers.some((t) => reAnyLine.test(t.raw));
      }
    }
    for (const item of list.items) {
      const first = item.tokens[0];
      if (item.task && (first?.type === 'text' || first?.type === 'paragraph')) {
        item.text = item.text.replace(reListReplaceTask, '');
        first.raw = first.raw.replace(reListReplaceTask, '');
        first.text = first.text.replace(reListReplaceTask, '');
        const q = this.inlineQueue;
        for (let g = q.length - 1; g >= 0; g--) {
          if (reListIsTask.test(q[g].src)) {
            q[g].src = q[g].src.replace(reListReplaceTask, '');
            break;
          }
        }
        const box = reListTaskCheckbox.exec(item.raw);
        if (box) {
          const checkbox = { type: 'checkbox', raw: box[0] + ' ', checked: box[0] !== '[ ]' };
          item.checked = checkbox.checked;
          if (list.loose) {
            const t0 = item.tokens[0];
            if (t0 && (t0.type === 'paragraph' || t0.type === 'text') && 'tokens' in t0 && t0.tokens) {
              t0.raw = checkbox.raw + t0.raw;
              t0.text = checkbox.raw + t0.text;
              t0.tokens.pre = renderCheckbox(checkbox) + t0.tokens.pre;
            } else item.tokens.unshift({ type: 'paragraph', raw: checkbox.raw, text: checkbox.raw, tokens: { src: '', html: '', pre: renderCheckbox(checkbox) } });
          } else item.tokens.unshift(checkbox);
        }
      } else if (item.task) item.task = false;
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
      if (!reStartAngleBracket.test(cap[2]) && findClosingBracket(cap[2], '()') !== -1) return;
      const tag = normalizeLabel(cap[1]);
      const href = cap[2] ? unescapePunct(cap[2].replace(reHrefBrackets, '$1')) : '';
      const title = cap[3] ? unescapePunct(cap[3].substring(1, cap[3].length - 1)) : cap[3];
      return { type: 'def', tag, raw: rtrim(cap[0], '\n'), href, title };
    }
  }

  table(src) {
    const cap = bTable.exec(src);
    if (!cap || !reTableDelimiter.test(cap[2])) return;
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(reTableAlignChars, '').split('|');
    const rows = cap[3]?.trim() ? cap[3].replace(reTableRowBlankLine, '').split('\n') : [];
    const item = { type: 'table', raw: rtrim(cap[0], '\n'), header: [], align: [], rows: [] };
    if (headers.length !== aligns.length) return;
    for (const a of aligns) {
      if (reTableAlignRight.test(a)) item.align.push('right');
      else if (reTableAlignCenter.test(a)) item.align.push('center');
      else if (reTableAlignLeft.test(a)) item.align.push('left');
      else item.align.push(null);
    }
    for (let i = 0; i < headers.length; i++) item.header.push({ text: headers[i], tokens: this.inline(headers[i]), header: true, align: item.align[i] });
    for (const row of rows) item.rows.push(splitCells(row, item.header.length).map((cell, i) => ({ text: cell, tokens: this.inline(cell), header: false, align: item.align[i] })));
    return item;
  }

  lheading(src) {
    if (!maySetext(src)) return;
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

  // ----- inline level -----
  linkInText(text) {
    if (!text.includes('[')) return false;
    for (const m of text.matchAll(iBlockSkip)) {
      if (iLink.test(m[0]) && text.charAt(m.index - 1) !== '!') return true;
    }
    for (const m of text.matchAll(iReflinkSearch)) {
      const s = m[0];
      const r = s.lastIndexOf('[');
      if (!(s.charAt(0) === '!' || !Object.hasOwn(this.links, normalizeLabel(s.slice(r + 1, -1)))) && !(r > 1 && this.linkInText(s.slice(1, r - 1)))) return true;
    }
    return false;
  }

  // Lex `src` and return its HTML (plain = marked's TextRenderer output, used for image alt text).
  inlineTokens(src, plain) {
    // R3: a source with no inline syntax at all is one text token.
    if (!rePlainBreaker.test(src)) {
      if (this.state.inRawBlock) return src;
      const text = unescapeNumeric(src);
      return plain ? text : escape(text);
    }
    const prev = this.state.linkParenPossible;
    this.state.linkParenPossible = prev && src.includes(')');
    try {
      return this.inlineLoop(src, plain);
    } finally {
      this.state.linkParenPossible = prev;
    }
  }

  mask(src) {
    let out = src;
    if (this.hasLinks && src.includes('[')) {
      const re = iReflinkSearch;
      const repl = (m) => {
        const o = m.lastIndexOf('[');
        if (!Object.hasOwn(this.links, normalizeLabel(m.slice(o + 1, -1)))) return m;
        if (o > 1 && m.charAt(0) !== '!') {
          const inner = m.slice(1, o - 1);
          if (this.linkInText(inner)) return '[' + inner.replace(re, repl) + '][' + 'a'.repeat(m.length - o - 2) + ']';
        }
        return '[' + 'a'.repeat(m.length - 2) + ']';
      };
      out = out.replace(re, repl);
    }
    if (src.includes('\\') || src.includes('`')) out = out.replace(iAnyPunctuationOutsideCode, (m, ticks, punct) => (punct ? '+'.repeat(m.length) : ticks ? ticks + m.slice(ticks.length, -ticks.length).replace(reBacktickGlobal, '+') + ticks : m));
    if (src.includes('[') || src.includes('`') || src.includes('<')) out = out.replace(iBlockSkip, (m, a, pre) => {
      const o = pre ? pre.length : 0;
      return m.slice(0, o) + '[' + 'a'.repeat(m.length - o - 2) + ']';
    });
    return out;
  }

  inlineLoop(src, plain) {
    // C1: the emphasis mask and closer indexes are built only when emStrong/del needs them.
    const ctx = { src, masked: null, closers: null };
    const hasAt = src.includes('@');
    const urlPossible = hasAt || src.includes(':') || src.includes('www.');
    const textRe = hasAt ? iText : urlPossible ? iTextNoEmail : iTextPlain;
    let out = '';
    // pending text run (marked merges adjacent text tokens; the merged token keeps the first one's flag)
    let pend = null;
    let pendRaw = false;
    let keepPrevChar = false;
    let prevChar = '';
    let maxLen = Infinity;
    let r;
    while (src) {
      if (src.length < maxLen) maxLen = src.length;
      else throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
      if (!keepPrevChar) prevChar = '';
      keepPrevChar = false;
      const c = src.charCodeAt(0);

      if (c === 92) {
        const cap = iEscape.exec(src);
        if (cap) {
          if (pend !== null) {
            out += plain || pendRaw ? pend : escape(pend);
            pend = null;
          }
          out += plain ? cap[1] : escape(cap[1]);
          src = src.substring(cap[0].length);
          continue;
        }
      }
      if (c === 60 && (r = this.tag(src))) {
        if (pend !== null) {
          out += plain || pendRaw ? pend : escape(pend);
          pend = null;
        }
        out += r;
        src = src.substring(r.length);
        continue;
      }
      if (c === 33 || c === 91) {
        if ((r = this.link(src, plain)) || (r = this.reflink(src, plain))) {
          src = src.substring(r.raw.length);
          if (r.html === undefined) {
            // reflink without a definition: a text token holding the first character
            if (pend !== null) pend += r.raw;
            else {
              pend = r.raw;
              pendRaw = false;
            }
            continue;
          }
          if (pend !== null) {
            out += plain || pendRaw ? pend : escape(pend);
            pend = null;
          }
          out += r.html;
          continue;
        }
      }
      if ((c === 42 || c === 95) && (r = this.emStrong(src, ctx, prevChar, plain))) {
        if (pend !== null) {
          out += plain || pendRaw ? pend : escape(pend);
          pend = null;
        }
        out += r.html;
        src = src.substring(r.raw.length);
        continue;
      }
      if (c === 96) {
        const cap = iCode.exec(src);
        if (cap) {
          if (pend !== null) {
            out += plain || pendRaw ? pend : escape(pend);
            pend = null;
          }
          let text = cap[2].replace(reNewLineCharGlobal, ' ');
          if (reNonSpaceChar.test(text) && reStartingSpaceChar.test(text) && reEndingSpaceChar.test(text)) text = text.substring(1, text.length - 1);
          out += plain ? text : `<code>${escape(text, true)}</code>`;
          src = src.substring(cap[0].length);
          continue;
        }
      }
      if (c === 32 || c === 92) {
        const cap = iBr.exec(src);
        if (cap) {
          if (pend !== null) {
            out += plain || pendRaw ? pend : escape(pend);
            pend = null;
          }
          if (!plain) out += '<br>';
          src = src.substring(cap[0].length);
          continue;
        }
      }
      if (c === 126 && (r = this.del(src, ctx, prevChar, plain))) {
        if (pend !== null) {
          out += plain || pendRaw ? pend : escape(pend);
          pend = null;
        }
        out += r.html;
        src = src.substring(r.raw.length);
        continue;
      }
      if ((c === 60 && (r = this.autolink(src, plain))) || (urlPossible && !this.state.inLink && isUrlStart(c) && (r = this.url(src, plain)))) {
        if (pend !== null) {
          out += plain || pendRaw ? pend : escape(pend);
          pend = null;
        }
        out += r.html;
        src = src.substring(r.raw.length);
        continue;
      }
      const cap = textRe.exec(src);
      if (cap) {
        const raw = cap[0];
        src = src.substring(raw.length);
        if (raw.charCodeAt(raw.length - 1) !== 95) prevChar = raw.slice(-1);
        keepPrevChar = true;
        const inRaw = this.state.inRawBlock;
        const text = inRaw ? raw : unescapeNumeric(raw);
        if (pend !== null) pend += text;
        else {
          pend = text;
          pendRaw = inRaw;
        }
        continue;
      }
      if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
    if (pend !== null) out += plain || pendRaw ? pend : escape(pend);
    return out;
  }

  maskOf(ctx) {
    if (ctx.masked === null) ctx.masked = this.mask(ctx.src);
    return ctx.masked;
  }

  closersOf(ctx) {
    if (ctx.closers === null) ctx.closers = closerIndexes(this.maskOf(ctx));
    return ctx.closers;
  }

  tag(src) {
    const cap = iTag.exec(src);
    if (!cap) return;
    const st = this.state;
    if (!st.inLink && reStartATag.test(cap[0])) st.inLink = true;
    else if (st.inLink && reEndATag.test(cap[0])) st.inLink = false;
    if (!st.inRawBlock && reStartPreScriptTag.test(cap[0])) st.inRawBlock = true;
    else if (st.inRawBlock && reEndPreScriptTag.test(cap[0])) st.inRawBlock = false;
    return cap[0];
  }

  // marked's Be(): does the link label contain an html tag/autolink that runs past the label?
  labelHasHtmlConflict(src, label, offset) {
    if (!label.includes('<')) return false;
    for (let s = 0; s < label.length; s++) {
      if (label[s] === '\\') {
        s++;
        continue;
      }
      if (label[s] === '`') {
        const c = iCode.exec(label.slice(s));
        if (c) {
          s += c[0].length - 1;
          continue;
        }
      }
      if (label[s] !== '<') continue;
      const rest = src.slice(offset + s);
      const m = iTag.exec(rest) || iAutolink.exec(rest);
      if (m) {
        if (m[0].length > label.length - s) return true;
        s += m[0].length - 1;
      }
    }
    return false;
  }

  outputLink(cap, link, raw, plain) {
    const href = link.href;
    const title = link.title || null;
    const text = cap[1].includes('\\') ? cap[1].replace(reOutputLinkReplace, '$1') : cap[1];
    const isImage = cap[0].charAt(0) === '!';
    const st = this.state;
    const prevInLink = st.inLink;
    const prevEmitted = st.linkEmitted;
    const prevRaw = st.inRawBlock;
    st.inLink = true;
    st.linkEmitted = false;
    // an image's content is only ever rendered as plain text (its alt attribute)
    const inner = this.inlineTokens(text, plain || isImage);
    const emitted = st.linkEmitted;
    st.linkEmitted = prevEmitted;
    st.inLink = prevInLink;
    if (!isImage) {
      if (emitted) {
        st.inRawBlock = prevRaw;
        return;
      }
      st.linkEmitted = true;
    }
    if (plain) return { raw, html: inner };
    const url = cleanUrl(href);
    if (isImage) {
      if (url === null) return { raw, html: escape(inner) };
      let out = `<img src="${escape(url)}" alt="${escape(inner)}"`;
      if (title) out += ` title="${escape(title)}"`;
      return { raw, html: out + '>' };
    }
    if (url === null) return { raw, html: inner };
    let out = '<a href="' + escape(url) + '"';
    if (title) out += ' title="' + escape(title) + '"';
    return { raw, html: out + '>' + inner + '</a>' };
  }

  link(src, plain) {
    if (this.state.linkParenPossible === false) return;
    const cap = iLink.exec(src);
    if (!cap) return;
    const offset = cap[0].charAt(0) === '!' ? 2 : 1;
    if (this.labelHasHtmlConflict(src, cap[1], offset)) return;
    const trimmedUrl = cap[2].trim();
    if (reStartAngleBracket.test(trimmedUrl)) {
      if (!reEndAngleBracket.test(trimmedUrl)) return;
      const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), '\\');
      if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) return;
    } else {
      const lastParen = findClosingBracket(cap[2], '()');
      if (lastParen === -2) return;
      if (lastParen > -1) {
        const linkLen = (cap[0].indexOf('!') === 0 ? 5 : 4) + cap[1].length + lastParen;
        cap[2] = cap[2].substring(0, lastParen);
        cap[0] = cap[0].substring(0, linkLen).trim();
        cap[3] = '';
      }
    }
    const rt = rtrim(cap[0].slice(0, -1), '\\');
    if ((cap[0].length - rt.length) % 2 === 0) return;
    let href = cap[2];
    const title = cap[3] ? cap[3].slice(1, -1) : '';
    href = href.trim();
    if (reStartAngleBracket.test(href)) href = href.slice(1, -1);
    return this.outputLink(cap, { href: href && unescapePunct(href), title: title && unescapePunct(title) }, cap[0], plain);
  }

  reflink(src, plain) {
    let cap;
    if ((cap = iReflink.exec(src)) || (cap = iNolink.exec(src))) {
      const offset = cap[0].charAt(0) === '!' ? 2 : 1;
      if (this.labelHasHtmlConflict(src, cap[1], offset)) return;
      const link = this.links[normalizeLabel(cap[2] || cap[1])];
      if (!link) {
        return { raw: cap[0].charAt(0), html: undefined };
      }
      return this.outputLink(cap, link, cap[0], plain);
    }
  }

  emStrong(src, ctx, prevChar, plain) {
    let match = iEmStrongLDelim.exec(src);
    if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return;
    const maskedSrc = this.maskOf(ctx);
    const delimChar = match[0][0];
    const prevIsDelim = prevChar === delimChar;
    const pos = maskedSrc.length - src.length;
    let runStart = pos;
    while (runStart > 0 && maskedSrc[runStart - 1] === delimChar) runStart--;
    const before = lastCodePointBefore(maskedSrc, runStart);
    const beforeIsPunct = before === '*' || before === '_' || !!iPunctuation.exec(before);
    if (runStart < pos) prevChar = before;
    const prevPunct = runStart < pos ? beforeIsPunct : !!iPunctuation.exec(prevChar);
    if (match[4] && prevChar.match(reUnicodeAlphaNumeric)) return;
    const lPunct = match[1] || match[3] || '';
    if (!lPunct || !prevChar || prevPunct) {
      const lLength = match[0].length - (match[1] || match[2] || match[3] || match[4]).length;
      let rDelim;
      let rLength;
      let delimTotal = lLength;
      let midDelimTotal = 0;
      const fullRun = pos - runStart + lLength;
      const leftFlankRestricted = !!before.trim() && (!!lPunct || (delimChar === '*' && !beforeIsPunct));
      if (delimChar !== '*' && delimChar !== '_') return;
      const endReg = delimChar === '*' ? iEmStrongRDelimAst : iEmStrongRDelimUnd;
      const lastCloser = this.closersOf(ctx).em[delimChar];
      const startOffset = maskedSrc.length - src.length + lLength;
      if (lastCloser < startOffset) return;
      const searchSrc = maskedSrc.slice(-1 * src.length + lLength);
      const limit = lastCloser - startOffset;
      endReg.lastIndex = 0;
      while ((match = endReg.exec(searchSrc)) !== null && !(match.index > limit)) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = rDelim.length;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        } else if (match[5] || match[6] || leftFlankRestricted) {
          if (prevIsDelim && (match[5] || match[6])) break;
          if (fullRun % 3 && !((fullRun + rLength) % 3)) {
            midDelimTotal += rLength;
            continue;
          }
        }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = firstCodePointLength(match[0]);
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const inner = this.inlineTokens(raw.slice(1, -1), plain);
          return { raw, html: plain ? inner : '<em>' + inner + '</em>' };
        }
        const inner = this.inlineTokens(raw.slice(2, -2), plain);
        return { raw, html: plain ? inner : '<strong>' + inner + '</strong>' };
      }
    }
  }

  del(src, ctx, prevChar, plain) {
    let match = iDelLDelim.exec(src);
    if (!match) return;
    const lPunct = match[1] || '';
    if (!lPunct || !prevChar || iPunctuation.exec(prevChar)) {
      const maskedSrc = this.maskOf(ctx);
      const lLength = match[0].charCodeAt(1) === 126 ? 2 : 1;
      let rDelim;
      let rLength;
      let delimTotal = lLength;
      const endReg = iDelRDelim;
      const lastCloser = this.closersOf(ctx).del;
      const startOffset = maskedSrc.length - src.length + lLength;
      if (lastCloser < startOffset) return;
      const searchSrc = maskedSrc.slice(-1 * src.length + lLength);
      const limit = lastCloser - startOffset;
      endReg.lastIndex = 0;
      while ((match = endReg.exec(searchSrc)) !== null && !(match.index > limit)) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = rDelim.length;
        if (rLength !== lLength) continue;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal);
        const lastCharLength = firstCodePointLength(match[0]);
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        const inner = this.inlineTokens(raw.slice(lLength, -lLength), plain);
        return { raw, html: plain ? inner : '<del>' + inner + '</del>' };
      }
    }
  }

  autolink(src, plain) {
    const cap = iAutolink.exec(src);
    if (cap) {
      const text = cap[1];
      return { raw: cap[0], html: plain ? text : renderAutolink(text, cap[2] === '@' ? 'mailto:' + text : text) };
    }
  }

  url(src, plain) {
    const cap = iUrl.exec(src);
    if (!cap) return;
    let text;
    let href;
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
    return { raw: cap[0], html: plain ? text : renderAutolink(text, href) };
  }

}

// ---------------------------------------------------------------------------------------------------
// Renderer (marked's Renderer + Parser, fused)
// ---------------------------------------------------------------------------------------------------
function renderBlocks(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'space':
        break;
      case 'hr':
        out += '<hr>\n';
        break;
      case 'heading':
        out += `<h${t.depth}>${renderSlot(t.tokens)}</h${t.depth}>\n`;
        break;
      case 'code':
        out += renderCode(t);
        break;
      case 'table':
        out += renderTable(t);
        break;
      case 'blockquote':
        out += `<blockquote>\n${renderBlocks(t.tokens)}</blockquote>\n`;
        break;
      case 'list':
        out += renderList(t);
        break;
      case 'checkbox':
        out += renderCheckbox(t);
        break;
      case 'html':
        out += t.text;
        break;
      case 'def':
        break;
      case 'paragraph':
        out += `<p>${renderSlot(t.tokens)}</p>\n`;
        break;
      case 'text':
        out += renderText(t);
        break;
      default:
        throw new Error('Token with "' + t.type + '" type was not found.');
    }
  }
  return out;
}

function renderCode(t) {
  const lang = (t.lang || '').match(reNotSpaceStart)?.[0];
  const code = t.text ? t.text.replace(reEndingNewline, '') + '\n' : '';
  return lang ? '<pre><code class="language-' + escape(lang) + '">' + escape(code, true) + '</code></pre>\n' : '<pre><code>' + escape(code, true) + '</code></pre>\n';
}

function renderTable(t) {
  let header = '';
  let cell = '';
  for (let r = 0; r < t.header.length; r++) cell += renderCell(t.header[r]);
  header += `<tr>\n${cell}</tr>\n`;
  let body = '';
  for (let r = 0; r < t.rows.length; r++) {
    const row = t.rows[r];
    cell = '';
    for (let i = 0; i < row.length; i++) cell += renderCell(row[i]);
    body += `<tr>\n${cell}</tr>\n`;
  }
  if (body) body = `<tbody>${body}</tbody>`;
  return '<table>\n<thead>\n' + header + '</thead>\n' + body + '</table>\n';
}

function renderCell(c) {
  const content = renderSlot(c.tokens);
  const tag = c.header ? 'th' : 'td';
  return (c.align ? `<${tag} align="${c.align}">` : `<${tag}>`) + content + `</${tag}>\n`;
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

function renderText(t) {
  return renderSlot(t.tokens);
}

function renderSlot(slot) {
  return slot.pre + slot.html;
}

function renderAutolink(text, href) {
  const content = escape(text, true);
  const url = cleanUrl(href);
  if (url === null) return content;
  return '<a href="' + escape(url, true) + '">' + content + '</a>';
}

/** The HTML marked 18.1.3 renders for `markdown` with its default options. */
export function parse(markdown) {
  try {
    return renderBlocks(new Lexer().lex(markdown));
  } catch (e) {
    e.message += '\nPlease report this to https://github.com/markedjs/marked.';
    throw e;
  }
}

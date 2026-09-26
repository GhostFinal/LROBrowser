const POLICY_KEY = '__lastroIwaHtmlPolicy';
const UNSAFE_HTML = /<\s*\/?\s*(?:script|iframe|object|embed|base|meta|link|style)\b|\bon[a-z][\w:-]*\s*=|\b(?:javascript|vbscript):|\bsrcdoc\s*=/i;

function validateHtml(value) {
  const html = String(value);
  if (UNSAFE_HTML.test(html)) throw new TypeError('unsafe HTML rejected by LastRO policy');
  return html;
}

function createTrustedHtml(value) {
  const html = validateHtml(value);
  const trustedTypes = globalThis.trustedTypes;
  if (!trustedTypes) return html;
  const policy = globalThis[POLICY_KEY] ?? (globalThis[POLICY_KEY] = trustedTypes.createPolicy('lastro-iwa-html', {
    createHTML: validateHtml,
  }));
  return policy.createHTML(html);
}

export function setLastROInnerHTML(element, value) {
  if (String(value) === '') {
    element.replaceChildren();
    return;
  }
  element.innerHTML = createTrustedHtml(value);
}

export function setLastROOuterHTML(element, value) {
  element.outerHTML = createTrustedHtml(value);
}

export function setLastROAdjacentHTML(element, position, value) {
  if (String(value) === '') return;
  element.insertAdjacentHTML(position, createTrustedHtml(value));
}

export function parseLastROXML(parser, value) {
  const document = parser.parseFromString(createTrustedHtml(value), 'application/xml');
  if (document.querySelector('parsererror')) throw new TypeError('Invalid LastRO XML');
  return document;
}

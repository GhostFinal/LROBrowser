// Keep the policy capability private: a writable global policy can be replaced
// or used to mint unsanitized TrustedHTML by unrelated runtime code.
/* eslint-disable no-control-regex -- Security filters intentionally reject ASCII controls. */
const policies = new WeakMap();
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const PASSIVE_ORIGINS = new Set(['https://game.lastro.cn', 'https://rodata.ltsd.ro']);
const ACTIVE_ELEMENTS = new Set('script iframe object embed base meta link style svg math'.split(' '));

function unsafe() { throw new TypeError('unsafe HTML rejected by LastRO policy'); }

function trustedHtml(value) {
  const factory = globalThis.trustedTypes;
  if (!factory) return value;
  let policy = policies.get(factory);
  if (!policy) {
    // This raw conversion is used only for an inert template/XML parse, and for
    // output which has already passed the structural checks below. Never export it.
    policy = factory.createPolicy('lastro-iwa-html', { createHTML: html => html });
    policies.set(factory, policy);
  }
  return policy.createHTML(value);
}

function validateElement(element) {
  if (element.namespaceURI !== HTML_NAMESPACE || ACTIVE_ELEMENTS.has(element.localName)) unsafe();
  for (const attribute of element.attributes) {
    const name = attribute.name.toLowerCase();
    if (/^on/i.test(name) || name === 'srcdoc' || name === 'is') unsafe();
    if (['src', 'href', 'action', 'formaction', 'bg', 'hover', 'down'].includes(name)
      && /^(?:javascript|vbscript):|^data:(?:text\/html|application\/(?:xhtml\+xml|javascript))/i.test(attribute.value.replace(/[\u0000-\u0020]/g, ''))) unsafe();
  }
  if (element.localName === 'a') {
    element.setAttribute('rel', 'noopener noreferrer');
    element.setAttribute('referrerpolicy', 'no-referrer');
  }
}

function validateTarget(element) {
  if (!element?.ownerDocument?.createElement) unsafe();
  if (element.nodeType === 1 && (element.namespaceURI !== HTML_NAMESPACE || ACTIVE_ELEMENTS.has(element.localName))) unsafe();
}

function createTrustedHtml(element, value) {
  validateTarget(element);
  const html = String(value);
  if (html.includes('\u0000') || /<!DOCTYPE|<\?/i.test(html)) unsafe();
  const document = element.ownerDocument;
  const template = document.createElement('template');
  // Template contents are inert: custom elements are not upgraded, and image
  // requests are not started before the entire fragment has been checked.
  template.innerHTML = trustedHtml(html);
  const validateFragment = fragment => {
    for (const node of fragment.querySelectorAll('*')) {
      validateElement(node);
      if (node.localName === 'template') validateFragment(node.content);
    }
  };
  validateFragment(template.content);
  return trustedHtml(template.innerHTML);
}

export function setLastROInnerHTML(element, value) {
  if (String(value) === '') { element.replaceChildren(); return; }
  element.innerHTML = createTrustedHtml(element, value);
}

export function setLastROOuterHTML(element, value) {
  element.outerHTML = createTrustedHtml(element, value);
}

export function setLastROAdjacentHTML(element, position, value) {
  if (String(value) === '') return;
  element.insertAdjacentHTML(position, createTrustedHtml(element, value));
}

export function parseLastROXML(parser, value) {
  const xml = String(value);
  // Game data needs no DTD, external entities or stylesheet processing.
  if (xml.includes('\u0000') || /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(xml)) unsafe();
  const document = parser.parseFromString(trustedHtml(xml), 'application/xml');
  if (document.querySelector('parsererror')) throw new TypeError('Invalid LastRO XML');
  for (const element of document.querySelectorAll('*')) {
    if (/^(?:script|iframe|object|embed|base|meta|link|style|svg|math)$/i.test(element.localName)) unsafe();
    for (const attribute of element.attributes) {
      if (/^(?:on|srcdoc$)/i.test(attribute.name) || /(?:javascript|vbscript)\s*:/i.test(attribute.value.replace(/[\u0000-\u0020]/g, ''))) unsafe();
    }
  }
  return document;
}

export function openLastROExternalURL(value) {
  let url;
  try { url = new globalThis.URL(String(value)); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !PASSIVE_ORIGINS.has(url.origin)) return null;
  return globalThis.open(url.href, '_blank', 'noopener,noreferrer');
}

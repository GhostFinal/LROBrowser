import ts from 'typescript';

export function patchPetDialogueDecoding(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name?.getText(file) === 'getPetTalk') methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!methods.length && !source.includes('getPetTalk')) return source;
  const method = methods[0];
  if (methods.length !== 1 || !method.body || method.parent.name?.text !== 'DB') throw new Error('anchor:pet-dialogue');
  const calls = [];
  function findDecoders(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'CodepageManager.decodeString') calls.push(node);
    ts.forEachChild(node, findDecoders);
  }
  findDecoders(method.body);
  if (calls.length !== 2 || calls.some(call => call.arguments.length !== 1 || !call.arguments[0].getText(file).startsWith('PetTalkTable['))) {
    throw new Error('anchor:pet-dialogue');
  }
  // XML parsing already returns Unicode. Decoding its character low bytes again
  // corrupts Chinese, accented letters, and emoji before they reach the chat UI.
  for (const call of calls.sort((a, b) => b.getStart(file) - a.getStart(file))) {
    const callee = call.expression;
    source = source.slice(0, callee.getStart(file)) + '(text => typeof text === "string" ? text : false)' + source.slice(callee.end);
  }
  return source;
}

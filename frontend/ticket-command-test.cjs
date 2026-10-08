const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/lib/ticketCommand.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const parse=context.exports.parseTicketCommand;
for(const [text,selector] of [
 ['Jarvis, entrá a OhlimpiaERP y hacé el siguiente ticket','siguiente'],
 ['Quiero que resuelvas el ticket dotación del 8/10/2026','dotacion'],
 ['Por favor hacé el ticket Dotación en OhlimpiaERP','dotacion'],
 ['Resolvé el ticket "Dotación" del 8/10/2026','Dotación'],
 ['Jarvis, haz el ticket número 131 de OhlimpiaERP','131'],
]){assert.equal(parse(text)?.action,'run',text);assert.equal(parse(text)?.selector,selector,text);}
assert.equal(parse('Qué tickets hay en OhlimpiaERP')?.action,'list');
assert.equal(parse('Podés resolver el ticket de OhlimpiaERP')?.selector,undefined);
assert.equal(parse('No resuelvas el ticket Dotación'),undefined);
assert.equal(parse('Explicame qué es un ticket'),undefined);
console.log('PASS: órdenes por nombre, fecha, número y siguiente; consultas y negaciones.');

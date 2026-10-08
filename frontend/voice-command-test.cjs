const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/lib/voiceCommands.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
for(const text of ['gracias jarvis','¡Gracias, Jarvis!','Muchas gracias Jarvis','Jarvis, gracias','Jarvis muchas gracias','gracias Yarvis','gracias y arvis','gracias jarvis ya está'])assert.equal(context.exports.isStopReplyCommand(text),true,text);
for(const text of ['gracias','Jarvis','Explicame cómo decir gracias Jarvis','No digas gracias Jarvis','gracias Jarvis por resolver el ticket','Jarvis hacé el siguiente ticket'])assert.equal(context.exports.isStopReplyCommand(text),false,text);
console.log('PASS: frase de corte y variantes, sin confundir citas ni órdenes de tickets.');

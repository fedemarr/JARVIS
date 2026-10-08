import fs from 'node:fs/promises';
import path from 'node:path';

// Shared by the snapshot and MCP tools. No private files, links or executable configuration.
export const privatePart=/^(?:\.env(?:\..*)?|\.git|\.claude|\.agents|\.ssh|\.aws|\.vercel|node_modules|data|dist|build|coverage|artifacts|credentials.*|secrets?.*|id_rsa.*|id_ed25519.*)$|\.(?:pem|key|pfx|p12|db|sqlite|log)$/i;
export const secretText=/(?:sk-ant-[a-zA-Z0-9_-]+|sk-[a-zA-Z0-9_-]{20,}|(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s"']+|-----BEGIN [^-]*PRIVATE KEY-----)/;
export const textExtension=/\.(?:md|html?|txt|json|[cm]?js|jsx|tsx?|css|scss|sql|py|ya?ml|vue|prisma|xml|csv|svg)$/i;
export function redact(text:string) {return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g,'').replace(new RegExp(secretText.source,'g'),'[CREDENCIAL OCULTA]');}
export async function ticketPath(root:string,relative:string,write=false) {
  if(!relative || path.isAbsolute(relative) || relative.includes(':') || relative.includes('\0'))throw new Error('Ruta relativa requerida.');
  const parts=relative.split(/[\\/]/).filter(p=>p && p!=='.');
  if(parts.some(p=>p==='..' || privatePart.test(p)))throw new Error('Archivo privado o fuera del proyecto.');
  const resolvedRoot=await fs.realpath(root);
  let current=resolvedRoot;
  for(const part of parts) {
    current=path.join(current,part);
    try {if((await fs.lstat(current)).isSymbolicLink())throw new Error('Enlace no permitido.');}
    catch(e) {if(!write || (e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  const rel=path.relative(resolvedRoot,current);
  if(rel.startsWith('..') || path.isAbsolute(rel))throw new Error('Ruta fuera del proyecto.');
  return current;
}
export async function readTicketFile(root:string,relative:string) {
  const file=await ticketPath(root,relative);
  if(!textExtension.test(relative))throw new Error('Tipo de archivo no permitido.');
  const stat=await fs.stat(file);
  if(!stat.isFile() || stat.size>1024*1024)throw new Error('Archivo demasiado grande.');
  const text=await fs.readFile(file,'utf8');
  if(text.includes('\0') || secretText.test(text))throw new Error('Archivo binario o con credenciales.');
  return text;
}
export async function listTicketFiles(root:string,relative='.') {
  const directory=await ticketPath(root,relative);
  const entries=await fs.readdir(directory,{withFileTypes:true});
  return entries.filter(e=>!e.isSymbolicLink() && !privatePart.test(e.name)).slice(0,250)
    .map(e=>({path:path.posix.join(relative.replace(/\\/g,'/'),e.name),directory:e.isDirectory()}));
}
export async function writeTicketFile(root:string,relative:string,text:string) {
  if(!textExtension.test(relative) || Buffer.byteLength(text)>1024*1024 || text.includes('\0') || secretText.test(text))throw new Error('Contenido no permitido.');
  // Configuration that could add hooks or change the runner is not editable by the model.
  if(/(?:^|\/)(?:package(?:-lock)?\.json|.*\.config\.[cm]?[jt]s|CLAUDE\.md|AGENTS\.md)$/i.test(relative.replace(/\\/g,'/')))throw new Error('La configuración requiere revisión manual.');
  const file=await ticketPath(root,relative,true);
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,text,'utf8');
  return {written:relative};
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listTicketFiles, readTicketFile, writeTicketFile } from './ticketFiles';

// Only this server exposes tools to Claude. No terminal, native filesystem tools, or other MCPs.
async function main() {
  const root=process.env.JARVIS_TICKET_WORKSPACE;
  if(!root)throw new Error('Falta el espacio de trabajo.');
  const server=new Server({name:'jarvis-ticket',version:'1.0.0'},{capabilities:{tools:{}}});
  const response=async(action:()=>Promise<unknown>)=>{
    try{return {content:[{type:'text' as const,text:JSON.stringify(await action())}]};}
    catch(e){return {isError:true,content:[{type:'text' as const,text:e instanceof Error?e.message:'Operación bloqueada.'}]};}
  };
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[
    {name:'list_files',description:'Listar una carpeta del proyecto.',inputSchema:{type:'object',properties:{path:{type:'string'}},additionalProperties:false}},
    {name:'read_file',description:'Leer código o documentación por líneas (hasta 200 líneas y 16 KB). No permite credenciales.',inputSchema:{type:'object',properties:{path:{type:'string'},startLine:{type:'integer',minimum:1},maxLines:{type:'integer',minimum:1,maximum:200}},required:['path'],additionalProperties:false}},
    {name:'search_files',description:'Buscar texto literal en el código del proyecto y obtener líneas relevantes.',inputSchema:{type:'object',properties:{query:{type:'string'},path:{type:'string'}},required:['query'],additionalProperties:false}},
    {name:'write_file',description:'Crear o reemplazar un archivo en la copia del ticket.',inputSchema:{type:'object',properties:{path:{type:'string'},text:{type:'string'}},required:['path','text'],additionalProperties:false}},
    {name:'edit_file',description:'Reemplazar un fragmento exacto y único en un archivo. Preferir para archivos grandes.',inputSchema:{type:'object',properties:{path:{type:'string'},oldText:{type:'string'},newText:{type:'string'}},required:['path','oldText','newText'],additionalProperties:false}},
  ]}));
  server.setRequestHandler(CallToolRequestSchema,async request=>response(async()=>{
    const args=request.params.arguments;
    if(request.params.name==='list_files')return listTicketFiles(root,z.object({path:z.string().default('.')}).strict().parse(args || {}).path);
    if(request.params.name==='read_file') {
      const {path,startLine,maxLines}=z.object({path:z.string(),startLine:z.number().int().min(1).default(1),maxLines:z.number().int().min(1).max(200).default(120)}).strict().parse(args);
      const lines=(await readTicketFile(root,path)).split('\n');
      return {path,startLine,totalLines:lines.length,text:lines.slice(startLine-1,startLine-1+maxLines).map((line,index)=>`${startLine+index}: ${line}`).join('\n').slice(0,16000)};
    }
    if(request.params.name==='search_files') {
      const {query,path}=z.object({query:z.string().min(2).max(200),path:z.string().default('.')}).strict().parse(args);
      const pending=[path],matches:{path:string;line:number;text:string}[]=[];let scanned=0;
      while(pending.length && scanned<2000 && matches.length<40) {
        const folder=pending.shift()!;
        for(const entry of await listTicketFiles(root,folder)) {
          if(entry.directory){pending.push(entry.path);continue;}scanned++;
          let content:string;try{content=await readTicketFile(root,entry.path);}catch{continue;}
          const lines=content.split('\n');
          for(let index=0;index<lines.length && matches.length<40;index++)if(lines[index].toLowerCase().includes(query.toLowerCase()))matches.push({path:entry.path,line:index+1,text:lines[index].slice(0,300)});
          if(scanned>=2000 || matches.length>=40)break;
        }
      }
      return {matches,scanned,truncated:pending.length>0 || matches.length===40};
    }
    if(request.params.name==='write_file'){const {path,text}=z.object({path:z.string(),text:z.string()}).strict().parse(args);return writeTicketFile(root,path,text);}
    if(request.params.name==='edit_file') {
      const {path,oldText,newText}=z.object({path:z.string(),oldText:z.string().min(1).max(32000),newText:z.string().max(64000)}).strict().parse(args);
      const original=await readTicketFile(root,path);
      if(original.split(oldText).length!==2)throw new Error('El fragmento debe coincidir exactamente una vez. Leé más contexto.');
      return writeTicketFile(root,path,original.replace(oldText,newText));
    }
    throw new Error('Herramienta no disponible.');
  }));
  await server.connect(new StdioServerTransport());
}
main().catch(()=>{process.stderr.write('No se pudo iniciar el acceso al proyecto.\n');process.exitCode=1;});

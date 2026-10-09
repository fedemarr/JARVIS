import type { LlmMessage } from '../../../shared/llm';
import { publicUrl } from './publicFetch';

// Preserve access to pages actually read even if the model omits its citations.
// Search snippets alone never become verified source links.
export function webSourceLinks(messages:LlmMessage[],answer:string):string {
  const sources:{title:string;url:string}[]=[];
  for(const message of messages){
    if(message.role!=='tool')continue;
    for(const result of message.results || []){
      if(!result.ok || !['web_search','read_web_page'].includes(result.name))continue;
      try {
        const data=JSON.parse(result.content);
        const pages=result.name==='read_web_page' && data.text?[data]:(Array.isArray(data.sources)?data.sources.filter((source:any)=>source.status==='read' && source.text):[]);
        for(const page of pages){
          try {const url=publicUrl(page.url).href;
            if(!sources.some(source=>source.url===url))sources.push({url,title:String(page.title || new URL(url).hostname).replace(/[\[\]\r\n]/g,' ').trim().slice(0,100)});
          } catch {/* Never expose unvalidated destinations. */}
        }
      } catch {/* A non-JSON result cannot be presented as a verified page. */}
    }
  }
  if(!sources.length || sources.some(source=>answer.includes(source.url)))return '';
  return '\n\nFuentes consultadas: '+sources.slice(0,2).map(source=>`[${source.title}](${source.url})`).join(' · ')+'.';
}

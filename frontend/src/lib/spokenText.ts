// Keep punctuation as pauses, while removing visual markup from the voice track.
export function prepareSpokenText(text:string):string {
  return text
    .replace(/```[\s\S]*?```/g,' El bloque de código está disponible en el chat. ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]*\)/g,'$1')
    .replace(/https?:\/\/[^\s<>]+/g,' enlace disponible en el chat ')
    .replace(/^\s{0,3}#{1,6}\s+/gm,'')
    .replace(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)/gm,'')
    .replace(/\*{1,3}|_{1,3}|`+/g,'')
    .replace(/^\s*>\s?/gm,'')
    .replace(/\|/g,', ')
    .replace(/[…]|\.{3,}/g,'.')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu,'')
    .replace(/\n+/g,'. ')
    .replace(/([.!?,;:])\s*[.!?,;:]+/g,'$1')
    .replace(/\s+/g,' ').trim();
}

export function splitSpokenText(text:string,limit=220):string[] {
  const chunks:string[]=[];
  let remaining=text;
  while(remaining.length>limit){
    const prefix=remaining.slice(0,limit+1);
    const boundaries=[...prefix.matchAll(/[.!?;,:]\s+/g)];
    const boundary=boundaries.filter(match=>match.index!>=70).pop();
    const space=remaining.lastIndexOf(' ',limit);
    const end=boundary?boundary.index!+boundary[0].length:space>=70?space+1:limit;
    chunks.push(remaining.slice(0,end));remaining=remaining.slice(end);
  }
  if(remaining)chunks.push(remaining);
  return chunks;
}

export function findSpokenBoundary(text:string):number {
  const safe=(end:number)=>{
    const prefix=text.slice(0,end);
    return (prefix.match(/```/g)||[]).length%2===0 && prefix.lastIndexOf('](')<=prefix.lastIndexOf(')');
  };
  let end=0;
  for(const match of text.matchAll(/[.!?](?=\s)|\n/g)){
    const next=match.index!+match[0].length;
    if(next>=40 && safe(next))end=next;
  }
  if(!end && text.length>240){
    const space=text.lastIndexOf(' ',220);
    if(space>=80 && safe(space))end=space+1;
  }
  return end;
}

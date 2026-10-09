import { load } from 'cheerio';
import { publicUrl } from './publicFetch';

export function pageText(body:string,url:string,contentType='text/html') {
  if(!/html|xml/i.test(contentType))return {title:'',text:body.trim(),links:[],needsJavaScript:false,blocked:false};
  const $=load(body);
  const title=$('title').first().text().trim().slice(0,200);
  const hasScripts=$('script[src],script[type=module]').length>0;
  const appShell=$('#root,#app,#__next').length>0;
  $('script,style,noscript,iframe,svg,form,nav,footer,header').remove();
  $('p,li,h1,h2,h3,h4,br,tr,section,div').append('\n');
  const main=$('main,article,[role=main]').first();
  const selected=main.length?main:$('body');
  const text=selected.text().replace(/[\t ]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  const links:{title:string;url:string}[]=[];
  selected.find('a[href]').each((_i,el)=>{
    try {const target=publicUrl(new URL($(el).attr('href')!,url).href).href;
      const label=$(el).text().trim().slice(0,150);
      if(label && links.length<25 && !links.some(link=>link.url===target))links.push({title:label,url:target});
    } catch {/* Nonpublic destinations cannot be followed. */}
  });
  const blocked=/captcha|verify (?:you are|that you)|checking your browser|access denied|just a moment|verifica.*humano|unusual traffic/i.test(title+' '+text.slice(0,1200)) && text.length<2500;
  const needsJavaScript=hasScripts && (text.length<500 || appShell && text.length<2000) || /enable javascript|habilit[aá].*javascript|javascript.*(?:required|necesario)/i.test(text);
  return {title,text,links,needsJavaScript,blocked};
}

import { LlmMessage } from '../../../shared/llm';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatMessage({ message,onSpeak,disabled }: { message: LlmMessage;onSpeak?:(text:string)=>void;disabled?:boolean }) {
  if (message.role === 'tool' || !message.text) return null;
  const isUser = message.role === 'user';
  return (
    <article className={`transmission ${isUser ? 'transmission-user' : ''}`}>
      <div className="transmission-avatar" aria-hidden="true">{isUser ? 'F' : 'J'}</div>
      <div className="transmission-body">
        <div className="transmission-label">{isUser ? 'FEDERICO' : 'JARVIS'}<span>{isUser ? 'INSTRUCCIÓN' : 'RESPUESTA'}</span></div>
        <div className={`transmission-text ${isUser?'':'formatted-answer'}`}>{isUser?message.text:<Markdown remarkPlugins={[remarkGfm]} components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{message.text}</Markdown>}</div>
        {message.role==='assistant'&&onSpeak&&<button type="button" className="listen-answer" disabled={disabled} onClick={()=>onSpeak(message.text!)}>Escuchar respuesta</button>}
      </div>
    </article>
  );
}

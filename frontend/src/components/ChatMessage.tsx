import { LlmMessage } from '../../../shared/llm';

export function ChatMessage({ message }: { message: LlmMessage }) {
  if (message.role === 'tool' || !message.text) return null;
  const isUser = message.role === 'user';
  return (
    <article className={`transmission ${isUser ? 'transmission-user' : ''}`}>
      <div className="transmission-avatar" aria-hidden="true">{isUser ? 'F' : 'J'}</div>
      <div className="transmission-body">
        <div className="transmission-label">{isUser ? 'FEDERICO' : 'JARVIS'}<span>{isUser ? 'INSTRUCCIÓN' : 'RESPUESTA'}</span></div>
        <div className="transmission-text">{message.text}</div>
      </div>
    </article>
  );
}

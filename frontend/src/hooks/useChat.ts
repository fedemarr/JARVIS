import { useState, useEffect, useCallback, useRef } from 'react';
import { LlmMessage } from '../../../shared/llm';
import { apiFetch } from '../lib/api';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationWithMessages extends Conversation {
  messages: LlmMessage[];
}

export interface ToolCardData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  summary?: string;
  durationMs?: number;
}

export interface ConfirmationData {
  pendingId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

interface SseEvent {
  event: string;
  data: any;
}

function parseSseStream(chunks: string[]): SseEvent[] {
  const raw = chunks.join('');
  const events: SseEvent[] = [];
  const blocks = raw.split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.substring(7);
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.substring(6));
      }
    }
    if (dataLines.length > 0) {
      const dataText = dataLines.join('\n');
      try {
        events.push({ event, data: JSON.parse(dataText) });
      } catch (e) {
        console.error('Failed to parse SSE data:', dataText, e);
      }
    }
  }
  return events;
}

export const useChat = () => {
  const [messages, setMessages] = useState<LlmMessage[]>([]);
  const [input, setInput] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolCards, setToolCards] = useState<ToolCardData[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<ConfirmationData[]>([]);
  const requestRef=useRef<AbortController>();
  const cancelResponse=useCallback(()=>requestRef.current?.abort(),[]);
  useEffect(()=>()=>requestRef.current?.abort(),[]);

  const selectConversation = useCallback(async (id: string | undefined) => {
    setCurrentConversationId(id);
    if (id) {
      try {
        const response = await apiFetch(`/api/conversations/${id}`);
        if (response.ok) {
          const data: ConversationWithMessages = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error('Error fetching conversation messages:', error);
        setMessages([]);
      }
    } else {
      setMessages([]); // Start a new empty chat
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await apiFetch('/api/conversations');
      if (response.ok) {
        const data: Conversation[] = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const sendMessage = useCallback(
    async (text: string, conversationId?: string, onToken?: (delta: string) => void): Promise<string | null> => {
      if(requestRef.current)return null;
      const controller=new AbortController();
      requestRef.current=controller;
      setIsLoading(true);
      setToolCards([]);
      setPendingConfirmations([]);
      setMessages((prev) => [...prev, { role: 'user', text }]);
      let assistantText = '';

      try {
        const response = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, message: text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          controller.signal.throwIfAborted();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            controller.signal.throwIfAborted();
            if (!block.includes('data: ')) continue;
            const { event: eventType, data } = parseSseStream([block])[0] || {};
            if (!eventType) continue;

            if (eventType === 'token' && data.text) {
              assistantText += data.text;
              onToken?.(data.text);
              setMessages((prev) => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.role === 'assistant' && 'text' in lastMessage) {
                  return [...prev.slice(0, -1), { role: 'assistant', text: (lastMessage.text || '') + data.text }];
                }
                return [...prev, { role: 'assistant', text: data.text }];
              });
            } else if (eventType === 'conversation_started' && data.conversationId) {
              setCurrentConversationId(data.conversationId);
              fetchConversations(); // Refresh sidebar to show new conversation
            } else if (eventType === 'conversation_title_updated') {
              fetchConversations(); // Refresh sidebar to show updated title
            } else if (eventType === 'tool_start' && data.id) {
              setToolCards((prev) => [
                ...prev,
                { id: data.id, name: data.name, args: data.args || {}, status: 'running' },
              ]);
            } else if (eventType === 'tool_result' && data.id) {
              setToolCards((prev) =>
                prev.map((card) =>
                  card.id === data.id
                    ? {
                        ...card,
                        status: data.ok ? 'success' : 'error',
                        summary: data.summary || '',
                        durationMs: data.durationMs,
                      }
                    : card,
                ),
              );
            } else if (eventType === 'confirmation_required' && data.pendingId) {
              setPendingConfirmations((prev) => {
                if (prev.some((c) => c.pendingId === data.pendingId)) return prev;
                return [...prev, { pendingId: data.pendingId, tool: data.tool, args: data.args || {}, reason: data.reason || '' }];
              });
            } else if (eventType === 'confirmation') {
              setPendingConfirmations((prev) => prev.filter((c) => c.pendingId !== data.pendingId));
            } else if (eventType === 'done') {
              fetchConversations(); // Refresh conversations to ensure latest state
            } else if (eventType === 'error') {
              console.error('LLM Error:', data.message);
              setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${data.message}` }]);
            }
          }
        }
      } catch (error) {
        if(controller.signal.aborted)return null;
        console.error('Error sending message:', error);
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Error: Could not connect to JARVIS.' }]);
      } finally {
        if(requestRef.current===controller)requestRef.current=undefined;
        setIsLoading(false);
      }

      return assistantText || null;
    },
    [fetchConversations],
  );

  const confirmAction = useCallback(async (pendingId: string, approved: boolean) => {
    try {
      const response = await apiFetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId, approved }),
      });
      if (!response.ok) throw new Error('No se pudo confirmar la acción.');
      setPendingConfirmations((prev) => prev.filter((c) => c.pendingId !== pendingId));
    } catch (error) {
      console.error('Error confirming:', error);
    }
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', text }]);
  }, []);

  return {
    messages,
    input,
    setInput,
    sendMessage,
    cancelResponse,
    currentConversationId,
    conversations,
    selectConversation,
    fetchConversations,
    isLoading,
    toolCards,
    pendingConfirmations,
    confirmAction,
    addSystemMessage,
  };
};

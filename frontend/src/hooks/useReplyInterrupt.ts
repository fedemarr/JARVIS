import { useEffect, useRef } from 'react';
import { SttProvider } from '../../../shared/voice';
import { isStopReplyCommand } from '../lib/voiceCommands';

// While speaking, this listener accepts only the stop phrase; never task commands.
export function useReplyInterrupt({listener,enabled,onStop,isEcho}:{listener:SttProvider;enabled:boolean;onStop:()=>void;isEcho:(text:string)=>boolean}) {
  const stopRef=useRef(onStop);
  stopRef.current=onStop;
  useEffect(()=>{
    if(!enabled || !listener.supported)return;
    let active=true;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const receive=(text:string)=>{
      if(!active || stopped || !isStopReplyCommand(text) || isEcho(text))return;
      stopped=true;
      listener.abort();
      stopRef.current();
    };
    listener.onIntermediate(receive);
    listener.onFinal(receive);
    listener.onEnd(reason=>{
      if(active && !stopped && reason!=='error')timer=setTimeout(()=>{if(active && !stopped)listener.start();},250);
    });
    listener.start();
    return()=>{
      active=false;
      if(timer)clearTimeout(timer);
      listener.onIntermediate(()=>{});listener.onFinal(()=>{});listener.onEnd(()=>{});
      listener.abort();
    };
  },[listener,enabled,isEcho]);
}

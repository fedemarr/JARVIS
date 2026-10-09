// Feature detection: Safari exposes this API on supported iOS versions.
export function audioSessionMode(type:'playback'|'play-and-record'){
  const session=(navigator as Navigator&{audioSession?:{type:string}}).audioSession;
  if(session){try{session.type=type;}catch{/* Older implementations may reject a mode. */}}
}
export function voicePlayback(message:string){window.dispatchEvent(new CustomEvent('jarvis-voice-playback',{detail:message}));}
let testAudio:HTMLAudioElement|undefined;
export function playTestTone(){
  testAudio?.pause();audioSessionMode('playback');
  const audio=new Audio('/audio/voice-check.wav');testAudio=audio;audio.volume=1;
  audio.onended=()=>voicePlayback('El sonido de prueba terminó.');
  audio.onerror=()=>voicePlayback('No se pudo cargar el sonido de prueba.');
  // Called directly from the tap; do not move play() behind a timer or fetch.
  void audio.play().then(()=>voicePlayback('El navegador inició el sonido de prueba.')).catch(()=>voicePlayback('El navegador bloqueó el sonido. Abrí Jarvis en Safari y volvé a tocar «Probar sonido».'));
}

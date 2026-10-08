export function normalizeVoiceCommand(text:string):string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\by arvis\b|\byarvis\b/g,'jarvis').replace(/\s+/g,' ').trim();
}

export function isStopReplyCommand(text:string):boolean {
  return /^(?:(?:muchas )?gracias jarvis(?: (?:ya esta|listo|es suficiente))?|jarvis (?:muchas )?gracias)$/.test(normalizeVoiceCommand(text));
}

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export class LocalVoice {
  private worker?: ChildProcessWithoutNullStreams;
  private ready = false;
  private state:'starting'|'ready'|'unavailable' = 'unavailable';
  private pending?: { id:string; resolve:(audio:Buffer)=>void; reject:(error:Error)=>void; timer:NodeJS.Timeout };
  constructor(private root:string) {}
  start() {
    const executable = path.join(this.root,'data','voice-system-venv',process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (!fs.existsSync(executable)) return;
    this.state = 'starting';
    this.worker = spawn(executable,['-u',path.join(this.root,'voice-local','worker.py')],{windowsHide:true,stdio:'pipe'});
    // Mantener logs del modelo fuera de respuestas y nunca registrar texto del usuario.
    this.worker.stderr.resume();
    createInterface({input:this.worker.stdout}).on('line',(line) => {
      try {
        const message = JSON.parse(line);
        if (message.ready) {this.ready = true;this.state = 'ready';}
        if (this.pending && message.id === this.pending.id) {
          const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer);
          if (message.audio) pending.resolve(Buffer.from(message.audio,'base64'));
          else pending.reject(new Error('Voz no disponible.'));
        }
      } catch { /* Ignorar mensajes ajenos al protocolo. */ }
    });
    this.worker.on('error',() => this.fail());
    this.worker.on('exit',() => this.fail());
  }
  private fail() {
    this.ready = false;
    this.state = 'unavailable';
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('Voz no disponible.')); this.pending = undefined; }
  }
  status() { return {available:this.ready, state:this.state, busy:!!this.pending,engine:'kokoro',voice:'em_alex',local:true}; }
  synthesize(text:string):Promise<Buffer> {
    if (!this.ready || !this.worker || this.pending) return Promise.reject(new Error('Voz ocupada o no disponible.'));
    return new Promise((resolve,reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.fail(); this.worker?.kill(); },45000);
      this.pending = {id,resolve,reject,timer};
      this.worker!.stdin.write(JSON.stringify({id,text})+'\n');
    });
  }
  close() { this.fail(); this.worker?.kill(); }
}

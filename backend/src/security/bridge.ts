import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const BRIDGE_ORIGIN='https://jarvis-eta-blue.vercel.app';
export function createBridgeToken(key:string,now=Date.now()):string {
  const payload=`${Math.floor(now/1000)+600}.${randomBytes(16).toString('hex')}`;
  return payload+'.'+createHmac('sha256',key).update('desktop-read-voice:'+BRIDGE_ORIGIN+':'+payload).digest('hex');
}
export function validBridgeToken(token:string,key:string,now=Date.now()):boolean {
  const [expiry,nonce,signature,...extra]=token.split('.');
  const current=Math.floor(now/1000);
  if(extra.length || !/^\d+$/.test(expiry || '') || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '') || Number(expiry)<=current || Number(expiry)>current+600) return false;
  const expected=createHmac('sha256',key).update('desktop-read-voice:'+BRIDGE_ORIGIN+':'+expiry+'.'+nonce).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}

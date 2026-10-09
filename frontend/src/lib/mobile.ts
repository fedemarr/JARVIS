export const mobileDevice=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export const installedApp=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let installEvent:InstallEvent|undefined;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event as InstallEvent;window.dispatchEvent(new Event('jarvis-install-changed'));});
window.addEventListener('appinstalled',()=>{installEvent=undefined;window.dispatchEvent(new Event('jarvis-install-changed'));});
export async function installMobile(){
  if(!installEvent)return false;
  const event=installEvent;installEvent=undefined;
  await event.prompt();await event.userChoice;window.dispatchEvent(new Event('jarvis-install-changed'));return true;
}
export function initializeMobile(){
  if('serviceWorker' in navigator&&window.isSecureContext)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});},{once:true});
  let fullHeight=window.innerHeight;
  const resize=()=>{
    const height=window.visualViewport?.height||window.innerHeight;
    document.documentElement.style.setProperty('--jarvis-viewport-height',height+'px');
    const typing=document.activeElement?.matches('input,textarea');
    if(!typing)fullHeight=height;
    document.documentElement.toggleAttribute('data-mobile-keyboard',mobileDevice&&!!typing&&height<fullHeight*.8);
  };
  window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);document.addEventListener('focusin',resize);document.addEventListener('focusout',resize);resize();
}

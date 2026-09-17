/** DOM loader is available before the engine or any texture is downloaded. */
export class LoadingScreen {
  private static completed=new Map<string,number>();
  private static weights=new Map<string,number>();
  private static failed=false;
  private static ready=false;
  private static value=0;
  static progress(value:number,label='载入中') {
    if(this.failed)return;
    const root=document.getElementById('loading-screen');if(!root)return;
    this.value=Math.max(this.value,Math.max(0,Math.min(1,value)));
    const percent=Math.floor(this.value*100);
    root.setAttribute('aria-label',label);
    const bar=root.querySelector<HTMLElement>('[role="progressbar"]')!;
    bar.setAttribute('aria-valuenow',String(percent));
    bar.querySelector<HTMLElement>('i')!.style.width=`${percent}%`;
    root.querySelector('.loading-caption span')!.textContent=label==='载入中'?'整备军械':label;
    root.querySelector('.loading-caption strong')!.textContent=`${percent}%`;
  }
  static assets(files:Record<string,{bytes:number}>) {
    this.completed.clear();this.weights=new Map(Object.entries(files).map(([key,file])=>[key,file.bytes]));
    this.progress(.08);
  }
  /** Keep the same progress bar when the animated camp becomes available. */
  static mountInCamp(parent:HTMLElement,onEnter:()=>void) {
    const root=document.getElementById('loading-screen')!;
    root.classList.add('in-camp');parent.append(root);
    const enter=root.querySelector<HTMLButtonElement>('.loading-enter')!;
    enter.onclick=()=>{
      if(!this.ready||this.failed||enter.disabled)return;
      enter.disabled=true;onEnter();
    };
  }
  static file(key:string,progress:number) {
    this.completed.set(key,Math.max(this.completed.get(key)||0,Math.min(1,progress)));
    let done=0,total=0;for(const [id,bytes] of this.weights){total+=bytes;done+=bytes*(this.completed.get(id)||0);}
    this.progress(.08+(total?done/total:0)*.84);
  }
  static fail(message='载入失败，请重试') {
    this.failed=true;
    const root=document.getElementById('loading-screen');if(!root)return;
    root.setAttribute('aria-label',message);root.classList.add('failed');
    root.querySelector('.loading-caption span')!.textContent=message;
    const enter=root.querySelector<HTMLButtonElement>('.loading-enter')!;enter.disabled=true;enter.hidden=true;
    const retry=root.querySelector<HTMLButtonElement>('.loading-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();
  }
  static finish() {
    if(this.failed)return;
    this.ready=true;this.progress(1,'整备完成，进入布防');
    const root=document.getElementById('loading-screen')!;root.classList.add('ready');
    const enter=root.querySelector<HTMLButtonElement>('.loading-enter')!;enter.hidden=false;enter.disabled=false;
  }
  static get hasFailed(){return this.failed;}
}

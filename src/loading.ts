/** DOM loader is available before the engine or any texture is downloaded. */
export class LoadingScreen {
  private static completed=new Map<string,number>();
  private static weights=new Map<string,number>();
  private static failed=false;
  static progress(value:number,label='载入中') {
    if(this.failed)return;
    const root=document.getElementById('loading-screen');if(!root)return;
    const percent=Math.max(0,Math.min(100,Math.floor(value*100)));
    root.querySelector<HTMLElement>('.loading-label')!.textContent=label;
    root.querySelector<HTMLElement>('.loading-percent')!.textContent=`${percent}%`;
    const bar=root.querySelector<HTMLElement>('[role="progressbar"]')!;
    bar.setAttribute('aria-valuenow',String(percent));
    bar.querySelector<HTMLElement>('i')!.style.width=`${percent}%`;
  }
  static assets(files:Record<string,{bytes:number}>) {
    this.completed.clear();this.weights=new Map(Object.entries(files).map(([key,file])=>[key,file.bytes]));
    this.progress(.08);
  }
  static file(key:string,progress:number) {
    this.completed.set(key,Math.max(this.completed.get(key)||0,Math.min(1,progress)));
    let done=0,total=0;for(const [id,bytes] of this.weights){total+=bytes;done+=bytes*(this.completed.get(id)||0);}
    this.progress(.08+(total?done/total:0)*.84);
  }
  static fail(message='载入失败，请重试') {
    this.failed=true;
    const root=document.getElementById('loading-screen');if(!root)return;
    root.querySelector<HTMLElement>('.loading-label')!.textContent=message;
    const retry=root.querySelector<HTMLButtonElement>('.loading-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();
  }
  static finish() {
    if(this.failed)return;
    this.progress(1,'载入完成');
    requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('loading-screen')?.remove()));
  }
  static get hasFailed(){return this.failed;}
}

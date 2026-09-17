export const STAGE_WIDTH=1600;
export const STAGE_HEIGHT=900;

/** The entire game stays landscape, including the loader before Phaser starts. */
export function fitStage() {
  const viewport=document.getElementById('viewport')!;
  const stage=document.getElementById('stage')!;
  let lastBounds='';
  const resize=()=>{
    const box=viewport.getBoundingClientRect();
    const bounds=[box.left,box.top,box.width,box.height].join(',');
    if(bounds===lastBounds)return;
    lastBounds=bounds;
    const rotated=box.height>box.width;
    const width=rotated?box.height:box.width,height=rotated?box.width:box.height;
    stage.dataset.rotated=String(rotated);
    stage.style.setProperty('--fit',String(Math.min(width/STAGE_WIDTH,height/STAGE_HEIGHT)));
    stage.style.setProperty('--rotation',rotated?'90deg':'0deg');
    stage.dataset.fitted='true';
    window.dispatchEvent(new CustomEvent('stage-resize'));
  };
  new ResizeObserver(resize).observe(viewport);
  window.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('resize',resize);
  resize();
}

/** Capture one stable transform per gesture, avoiding layout reads on every move. */
export function stageCoordinates(stage:HTMLElement) {
  const rect=stage.getBoundingClientRect();
  const rotated=stage.dataset.rotated==='true';
  return (clientX:number,clientY:number)=>rotated?{
    x:(clientY-rect.top)/rect.height*STAGE_WIDTH,y:(rect.right-clientX)/rect.width*STAGE_HEIGHT,
  }:{x:(clientX-rect.left)/rect.width*STAGE_WIDTH,y:(clientY-rect.top)/rect.height*STAGE_HEIGHT};
}

export function stagePoint(stage:HTMLElement,clientX:number,clientY:number) {
  return stageCoordinates(stage)(clientX,clientY);
}

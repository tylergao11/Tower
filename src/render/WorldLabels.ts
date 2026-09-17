import Phaser from 'phaser';
import plaque from '../../assets/game/noncharacter-redraw/ui/nameplate.webp';
import speech from '../../assets/game/noncharacter-redraw/ui/speech.webp';
import banner from '../../assets/game/ui-redraw/banner.webp';
import coin from '../../assets/game/noncharacter-redraw/ui/coin.webp';

type Label={root:Phaser.GameObjects.Container;back:Phaser.GameObjects.Image;text:Phaser.GameObjects.Text;value:string};
/** Painted surfaces carry the live game text. Labels move with the battlefield. */
export class WorldLabels {
  private labels=new Map<string,Label>();
  private used=new Set<string>();
  constructor(private scene:Phaser.Scene){}
  static preload(scene:Phaser.Scene){scene.load.image('ui-nameplate',plaque);scene.load.image('ui-tier-banner',banner);scene.load.image('ui-speech',speech);scene.load.image('ui-money-coin',coin);}
  begin(){this.used.clear();}
  show(key:string,value:string,x:number,y:number,kind:'name'|'banner'|'speech'|'economy'|'skill'='name',color?:string){
    this.used.add(key);
    const bubble=kind==='speech'||kind==='skill';
    let label=this.labels.get(key);
    if(!label){
      const root=this.scene.add.container(0,0).setDepth(kind==='skill'?515:kind==='banner'?470:490);
      const back=this.scene.add.image(0,0,bubble?'ui-speech':kind==='banner'?'ui-tier-banner':'ui-nameplate');
      const text=this.scene.add.text(0,0,'',{fontFamily:'Tower Display, Microsoft YaHei, sans-serif',fontSize:kind==='skill'?'28px':kind==='banner'?'27px':kind==='speech'?'24px':'25px',color:color||(kind==='banner'?'#fff0d5':'#261e16'),align:'center',padding:{x:3,y:3}}).setOrigin(.5);
      if(kind==='skill')text.setStroke('#fff1ce',1).setLineSpacing(5);
      if(kind==='economy'){back.setTint(0x65451c);text.setColor('#ffdf69').setStroke('#211507',2);}
      root.add([back,text]);label={root,back,text,value:''};this.labels.set(key,label);
    }
    if(label.value!==value){
      label.value=value;label.text.setText(kind==='banner'?value.split('').join('\n'):value);
      const w=Math.max(bubble?110:80,label.text.width+26),h=label.text.height+12;
      label.back.setDisplaySize(kind==='banner'?64:w+8,kind==='banner'?113:bubble?h+36:h);
      label.text.y=bubble?-7:0;
    }
    label.root.setPosition(x,y).setVisible(true);
    return label.root;
  }
  end(){for(const [key,label] of this.labels)if(!this.used.has(key)){label.root.destroy(true);this.labels.delete(key);}}
}

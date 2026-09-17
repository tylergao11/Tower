import Phaser from 'phaser';
import { VIEW } from './config';
import { GameScene } from './render/GameScene';
import './style.css';
import './art-ui.css';

new Phaser.Game({
  type:Phaser.AUTO,
  parent:'game',width:VIEW.width,height:VIEW.height,
  backgroundColor:'#191613',
  render:{antialias:true,pixelArt:false},
  input:{activePointers:2},
  scale:{mode:Phaser.Scale.NONE},
  scene:[GameScene],
  audio:{noAudio:true},
});

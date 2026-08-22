import './style.css';
import { GameApp } from './app/GameApp';
import { testMap } from './map/testMap';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

void new GameApp(root, testMap).start();

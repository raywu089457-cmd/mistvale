import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=await fs.readFile(path.resolve(root,'../../outputs/暮影村.html'),'utf8');
const sandbox={window:{}};
const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const assets=blocks.find(block=>block[1].includes('window.PIXEL_ASSETS.title='));
assert.ok(assets,'asset injection script exists');
vm.runInNewContext(assets[1],sandbox);
for(const name of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement']){
 const expected=await fs.readFile(path.join(root,name==='bounty'?'assets/concept-clean/noticeboard-web-v1.png':`assets/concept-clean/${name}-concept-v2.png`));
 const actual=Buffer.from(sandbox.window.PIXEL_ASSETS[name].split(',')[1],'base64');
 assert.deepEqual(actual,expected,`${name} embedded PNG matches current source`);
 console.log(`PASS ${name}: ${actual.length} bytes, current artwork embedded`);
}

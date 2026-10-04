import {build} from 'esbuild';
import {cpSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const output=resolve(root,'dist');
if(output!==join(root,'dist'))throw new Error('Unexpected build output');
if(existsSync(output))rmSync(output,{recursive:true});
mkdirSync(output,{recursive:true});
cpSync(join(root,'apps','office'),output,{recursive:true});
cpSync(join(root,'apps','shared'),join(output,'shared'),{recursive:true});
await build({absWorkingDir:root,entryPoints:['apps/frontend/src/entry.jsx'],bundle:true,minify:true,
  format:'esm',target:['es2022'],outfile:join(output,'shared/react-ui.js'),
  define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
console.log('Built office frontend in dist/');

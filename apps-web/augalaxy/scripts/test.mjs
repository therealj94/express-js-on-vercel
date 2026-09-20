import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(path.join(tmpdir(),'orden-tests-'));
try{const outfile=path.join(temp,'tests.mjs');await build({entryPoints:['tests/experience.test.ts'],outfile,bundle:true,platform:'node',format:'esm',external:['node:*'],logLevel:'silent'});await import(pathToFileURL(outfile).href);}finally{await rm(temp,{recursive:true,force:true});}

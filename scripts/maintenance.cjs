const fs = require('node:fs');
const {execFileSync}=require('node:child_process');
fs.mkdirSync('reports',{recursive:true});
const diff=execFileSync('git',['diff','--binary'],{maxBuffer:64*1024*1024});
fs.writeFileSync('reports/maintenance.patch',diff);
fs.writeFileSync('reports/maintenance.json',JSON.stringify({sha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,bytes:diff.length},null,2));

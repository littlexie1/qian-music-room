const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const profile=path.join(__dirname,'state','ncm-profile');
fs.mkdirSync(profile,{recursive:true});
os.homedir=()=>profile;
// Keep the official CLI's background login worker in the same isolated profile.
const preload=path.join(__dirname,'ncm-isolate.cjs');
if(!(process.env.NODE_OPTIONS||'').includes(preload))process.env.NODE_OPTIONS=((process.env.NODE_OPTIONS||'')+' --require='+JSON.stringify(preload)).trim();

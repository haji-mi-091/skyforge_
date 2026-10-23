import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=data=>createHash('sha256').update(data).digest('hex'),sources=[];
for(const [directory,bank,bankIndex]of [['audio-engine','aircraft_engines.assets.bank',0],['audio-gun','aircraft_guns.assets.bank',1]]){
 const source='D:/SteamLibrary/steamapps/common/War Thunder/sound/'+bank,sourceHash=hash(await readFile(source));
 const inventory=JSON.parse(await readFile('sources/j16/'+directory+'/inventory.json'));
 for(const item of inventory){const file=item.file.split(/[\\/]/).at(-1),data=await readFile('audio/j16/'+file);sources.push({source,sourceBankSha256:sourceHash,bank:bankIndex,index:item.index,sample:item.name,file,seconds:item.seconds,sha256:hash(data)});}
}
await writeFile('audio/j16/sources.json',JSON.stringify({note:'Decoded with installed FMOD runtime; original banks are read-only inputs. Su-27 named engine recordings are a sound substitute, not a claimed WS-10B recording. 30mm gun uses GSh-30-1 clips, not M61.',sources},null,2)+'\n');console.log('Recorded eight local J-16 source clips and original bank / WAV SHA256 values.');

# Decode the J-10C sound set from the local War Thunder install with the FMOD
# runtime that ships with it. The banks are read-only inputs; only the chosen
# samples are written to audio/j10c/ (with sources.json recording origin and
# hashes). War Thunder has no J-10-specific engine recording: the J-10C uses
# the AL-31F family (WS-10 is its derivative), so the Su-27 AL-31F set is
# taken, as for the J-16. The Type 23-3 cannon is a GSh-23 copy: gsh_23 clips.
import ctypes as C,hashlib,json,struct,wave,sys
from pathlib import Path
WT=Path(r'D:\SteamLibrary\steamapps\common\War Thunder')
OUT=Path('audio/j10c');TMP=Path('work/j10c/audio-tmp')
WANT={'aircraft_engines.assets.bank':['idle_su_27_exterior','max_su_27_exterior','afterburner_su_27_exterior','max_su_27_cockpit_l','max_su_27_cockpit_r'],
      'aircraft_guns.assets.bank':['gsh_23_close-001','gsh_23_first_close-001','gsh_23_last_close-001']}
fmod=C.WinDLL(str(WT/'win64'/'fmod64.dll'))
def ok(r,what):
    if r:raise RuntimeError(f'{what}: FMOD error {r}')
system=C.c_void_p();ok(fmod.FMOD_System_Create(C.byref(system)),'create')
ok(fmod.FMOD_System_SetOutput(system,2),'nosound');ok(fmod.FMOD_System_Init(system,32,0,None),'init')
def fsb_names(fsb):
    assert fsb[:4]==b'FSB5'
    count,headers,names=struct.unpack_from('<III',fsb,8);base=0x3C+headers
    offs=struct.unpack_from(f'<{count}I',fsb,base)
    return [fsb[base+o:fsb.index(b'\0',base+o)].decode('latin1') for o in offs]
OUT.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True);sources=[]
for bank,wanted in WANT.items():
    raw=(WT/'sound'/bank).read_bytes();fsb=raw[raw.index(b'FSB5'):]
    names=fsb_names(fsb);tmp=TMP/(bank+'.fsb');tmp.write_bytes(fsb)
    sound=C.c_void_p();ok(fmod.FMOD_System_CreateSound(system,str(tmp).encode('mbcs'),0x8|0x80,None,C.byref(sound)),'open '+bank)
    for name in wanted:
        index=names.index(name);sub=C.c_void_p();ok(fmod.FMOD_Sound_GetSubSound(sound,index,C.byref(sub)),'sub '+name)
        t,f,ch,bits=C.c_int(),C.c_int(),C.c_int(),C.c_int();ok(fmod.FMOD_Sound_GetFormat(sub,C.byref(t),C.byref(f),C.byref(ch),C.byref(bits)),'format')
        freq,prio=C.c_float(),C.c_int();ok(fmod.FMOD_Sound_GetDefaults(sub,C.byref(freq),C.byref(prio)),'defaults')
        length=C.c_uint();ok(fmod.FMOD_Sound_GetLength(sub,C.byref(length),4),'length')
        fmod.FMOD_Sound_SeekData(sub,0);buf=C.create_string_buffer(length.value);got=C.c_uint()
        r=fmod.FMOD_Sound_ReadData(sub,buf,length.value,C.byref(got))
        if r not in (0,24):raise RuntimeError(f'read {name}: {r}')   # 24 = end of file
        pcm=buf.raw[:got.value];file=f'{index:04d}-{name}.wav'
        with wave.open(str(OUT/file),'wb') as w:w.setnchannels(ch.value);w.setsampwidth(bits.value//8);w.setframerate(int(freq.value));w.writeframes(pcm)
        data=(OUT/file).read_bytes()
        sources.append({'source':str(WT/'sound'/bank).replace('\\','/'),'sourceBankSha256':hashlib.sha256(raw).hexdigest(),'index':index,'sample':name,'file':file,
                        'rate':int(freq.value),'channels':ch.value,'bits':bits.value,'seconds':got.value/(ch.value*bits.value/8*freq.value),'sha256':hashlib.sha256(data).hexdigest()})
        print(file,ch.value,bits.value,int(freq.value),round(sources[-1]['seconds'],3))
    fmod.FMOD_Sound_Release(sound);tmp.unlink()
fmod.FMOD_System_Release(system)
(OUT/'sources.json').write_text(json.dumps({'note':'Decoded with the FMOD runtime of the local War Thunder install; banks are read-only inputs. War Thunder has no J-10-specific engine recording: the AL-31F (Su-27) set stands in for the J-10C AL-31FN / WS-10 family. Type 23-3 cannon = GSh-23 clips.','sources':sources},indent=2)+'\n',encoding='utf8')

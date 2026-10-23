# Local audio

Original War Thunder and voice-mod banks are read during extraction and are not modified.

## Effects

`pack.json` maps roles to browser-decodable local WAVs:

| Role | Source sample | Playback |
| --- | --- | --- |
| gun | m61_close_loop | Restarted per firing burst, with a release fade |
| engineCruise | jet_nozzle_cruise | Cruise layer, driven by spool |
| engineThrust | jet_nozzle_thrust | Crossfade toward military power |
| engineCockpitLeft / Right | jet_cockpit_01_l / r | Stereo cockpit mix |
| engineAfterburner | afterburner_loop | Actual afterburner state |
| missile | missile_start_med-001 | Existing launch effect |

These are the installed game's named generic jet layers, not a claimed reconstruction of a specific F100/F110 event. Engine volume and cockpit view affect the mix. Sampled engine/gun effects replace the corresponding synthetic bed once loaded; procedural wind and mechanical effects remain. Source indices and SHA-256 values are recorded in `local-sources.json`.

Each aircraft selects its own profile in game (`visual.audioManifest`): the
F-16s use `pack.json`, the J-16 `j16/pack.json`, the J-10C `j10c/pack.json`.

The J-16 profile is `j16/pack.json`. Its five engine layers are
the installed game's named Su-27 exterior idle/max/afterburner and cockpit L/R
clips. They are used as an engine-sound substitute, not identified as WS-10B
recordings. Three GSh-30-1 first/continuous/last shot clips drive the 30 mm gun
at 30 shots/s; the existing local missile-launch sample is reused. Original
bank paths, bank/sample indices and SHA256 values are in `j16/sources.json`.
The F-16 default profile and M61 burst behaviour remain independently selected.
`AudioEngine` accepts `sampleManifest`, `voices`, `tones` and `gunMode` options;
the preview uses `gunMode:'shots'`, with engine/gun effects synchronized to its
controls. Click “启用声音” in `/tools/j16-preview.html` to activate WebAudio.

The J-10C profile `j10c/pack.json` (`gunMode:'shots'`) is decoded by
`tools/extract-j10c-audio.py` with the FMOD runtime of the local War Thunder
install. War Thunder has no J-10-specific engine recording, so the same Su-27
(AL-31F) engine layers stand in; the 23 mm Type 23-3 cannon uses the GSh-23
first/continuous/last close clips. Sources and SHA256 values are in
`j10c/sources.json`.

## Electronic alerts

Electronic sounds use the existing extracted `wt-gui/manifest.json` samples,
independently of aircraft engine/gun profiles and the selected voice pack:

| Event | WT GUI sample |
| --- | --- |
| Seeker acquisition | con_scan_track-001 |
| IR lock | con_scan_capture-001 |
| Radar lock / RWR lock | radar_lock |
| RWR search | spin_scan_track-001 |
| Incoming missile / danger | alarm_rocket-001 |
| Caution / overload | alarm_overload-001 |
| New radar threat | alarm_wep |
| Menu click | click |

All eight required samples must decode before electronic audio is ready.
`Game.start()` waits for these samples, the selected voice manifest and the
aircraft sample profile before entering flight. Failed electronic/voice loads
show an error through the existing toast and can be retried with Start. Missing
electronic samples never activate the old synthesized lock/warning/RWR tones;
menu clicks also use the WT sample. Browser gesture requirements remain in place.
Procedural wind, mechanical sounds and the existing engine/weapon fallback
remain outside this electronic-alert fix. `tones:false` disables electronic
alerts in previews without activating synthetic replacements.

## Cockpit voices

Settings has two independent choices, preserving `yuuka` as default:

- **优香** (`voice/`): 66 recordings from the supplied Chinese Yuuka 2.0 bank, including its two radar-threat voice samples outside the `vws_` group.
- **中文女声1** (`voice-wt-zh/`): 36 Mandarin VWS recordings from the installed original aircraft_gui bank. The bank also has other-language recordings with identical event names; selected indices and source hashes are recorded in `voice-wt-zh/sources.json`.

Only manifest-listed WAVs load. Old unlisted files are ignored. The official Mandarin set lacks dedicated recordings for missile approach, check-mechanism, low/empty countermeasures and empty gun ammunition. Those use its own Mandarin warning phrase; the HUD retains the specific condition. Other unsupported optional phrases remain silent. Voices never mix speakers or use synthesized TTS.

`src/core/CockpitWarnings.js` connects actual simulated states: terrain/pull-up, angle of attack, speed, gear, G, RWR tracking/lock/missile and direction, fuel/bingo, fuel-exhausted engine failure, airframe damage, flap speed, ammunition, countermeasure deployment/low/empty and map boundary. Gear and airbrake announcements follow deployment, rather than just a key press. Unsimulated hydraulic, generator and separate left/right engine faults do not receive fabricated triggers.

Speech has condition cooldowns, a bounded priority queue and full sequence cancellation on urgent preemption, muting, pack changes or flight reset.

Enemy lock (`rwr_lock`) plays Yuuka's “敌跟踪” (`alram_radar_track_2.5s`); incoming missile (`rwr_missile`) plays “敌导弹” (`alram_radar_launch_1s`). Radar detection without a lock retains “空中雷达告警”. Our own target lock retains `vws_lock` and our own missile launch retains `vws_missile_launch`. The official Mandarin pack uses its own air-radar warning for enemy lock and generic warning for incoming missiles; it never reuses the own-lock confirmation for an enemy threat.

## Verification

- `node tests/audio-combat.test.mjs`
- `node tools/check-audio-game.mjs`
- `/tools/audio-preview.html` offers manual listening with engine, afterburner, cockpit, M61 burst and voice controls.

2026-10-23 repair: the previous loader swallowed electronic load errors and
cached a successful-looking promise; `update()` then enabled the old oscillator
fallback. Starting flight awaited only the aircraft profile. The same electronic
fallback exists in `work/audio-killfeed-before/src/core/Audio.js`, so it cannot
be attributed to the later consistency edits from this evidence. Before editing,
`Audio.js` and `voicePacks.js` had timestamps on 2026-10-21; the two voice directories
and pack aliases were still distinct. Healthy loading decoded all 61 GUI samples
and both voice sets. Injected delay/HTTP/decode failures reproduced the faulty
path; this does not establish which failure occurred in the user's session.

Backups: `work/audio-repair-20261023/backup/before/`. Reproduction and validation:
`work/audio-repair-20261023/before.json`, `node-results.json`,
`browser-results.json`, `audio-game-check.json`. The audio check verifies source
buffer identity for the electronic event mapping, audible PCM, both voices on
all four aircraft, independent readiness gates, failure/retry, restart and
pause/resume. Final listening remains a user acceptance check.

Validation result: all 22 Node test files and all six shipping-browser checks
passed (audio, gameplay controls, F-16 game, J-16 integration, J-10C integration,
doors); the separate pre-fix reproduction also completed successfully.

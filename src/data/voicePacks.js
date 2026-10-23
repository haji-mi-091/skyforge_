export const VOICE_PACKS = {
  yuuka: {
    label: '优香', path: 'audio/voice',
    // Enemy threats are separate from our own seeker/target-lock callouts.
    aliases: {
      rwr_lock: 'alram_radar_track_2.5s',
      rwr_missile: 'alram_radar_launch_1s',
    },
  },
  'wt-zh': {
    label: '中文女声1', path: 'audio/voice-wt-zh',
    // The official Mandarin bank lacks dedicated recordings for these events.
    // Use its own Mandarin "warning"; the HUD retains the specific condition.
    aliases: { ...Object.fromEntries([
      'vws_missile', 'vws_check_mech', 'vws_chaff_flare_low',
      'vws_out', 'gunner_out_of_ammo',
    ].map(key => [key, 'vws_warning'])),
      rwr_lock: 'vws_attack_air',
      rwr_missile: 'vws_warning',
    },
  },
};

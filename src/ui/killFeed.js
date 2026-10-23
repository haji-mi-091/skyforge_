// Weapon names travel with the projectile, rather than the shooter's current selection.
export function killWeaponName(event) {
  if (event.weaponName) return event.weaponName;
  if (event.source === 'cannon' || event.source === 'gun') {
    return event.attacker?.config?.armament?.cannon?.name || '机炮';
  }
  return event.source === 'missile' ? '导弹' : '机体损毁';
}

export function killFeedEntry(victim, event, player, time) {
  const attacker = event.attacker;
  const combat = attacker && ['cannon', 'gun', 'missile'].includes(event.source);
  const color = (aircraft) => aircraft === player ? 'player' : 'enemy';
  return {
    time,
    segments: combat ? [
      { text: attacker.callsign || '未知战机', color: color(attacker) },
      { text: `   ${killWeaponName(event)}   `, color: 'dim' },
      { text: victim.callsign || '未知战机', color: color(victim) },
    ] : [
      { text: victim.callsign || '未知战机', color: color(victim) },
      { text: ' 已损失', color: 'dim' },
    ],
  };
}

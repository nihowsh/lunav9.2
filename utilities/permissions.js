async function hasHighLevelAccess(guild, member, client) {
  if (!guild || !member) return false;
  
  if (guild.ownerId === member.id) {
    return true;
  }
  
  if (member.permissions.has('Administrator')) {
    return true;
  }
  
  const botMember = await guild.members.fetchMe();
  const botHighestRole = botMember.roles.highest;
  const memberHighestRole = member.roles.highest;
  
  if (memberHighestRole.comparePositionTo(botHighestRole) >= 0) {
    return true;
  }
  
  return false;
}

module.exports = {
  hasHighLevelAccess
};

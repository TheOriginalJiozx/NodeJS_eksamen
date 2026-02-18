export function isAdminFromAuth(authState) {
  return !!(authState && authState.role && String(authState.role).toLowerCase() === 'admin');
}

export function isOwnerFromAuth(authState, targetUsername) {
  if (!authState || !authState.username) return false;
  return String(authState.username) === String(targetUsername);
}

export function canManageUser(authState, targetUsername) {
  return isOwnerFromAuth(authState, targetUsername) || isAdminFromAuth(authState);
}

export default { isAdminFromAuth, isOwnerFromAuth, canManageUser };

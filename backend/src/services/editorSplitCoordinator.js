const activeBroadcastIds = new Set();
let transitionVersion = 0;

function getState(broadcastId) {
  return {
    active: activeBroadcastIds.has(broadcastId),
    version: transitionVersion,
  };
}

function tryStart(broadcastId) {
  if (activeBroadcastIds.has(broadcastId)) return false;
  activeBroadcastIds.add(broadcastId);
  transitionVersion += 1;
  return true;
}

function finish(broadcastId) {
  if (!activeBroadcastIds.delete(broadcastId)) return;
  transitionVersion += 1;
}

module.exports = { tryStart, finish, getState };

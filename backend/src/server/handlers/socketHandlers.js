import handleConnection from './connectionHandlers.js';

/**
 * @param {import('socket.io').Server} socketServer
 * @param {{ socketUsers: Record<string,any>, colorGame:any, getActivePollData?: Function, recordVote?: Function, getActivePollId?: Function }} options
 */
export function attachSocketHandlers(socketServer, { socketUsers, colorGame, getActivePollData, recordVote, getActivePollId }) {
  socketServer.on('connection', /** @param {import('socket.io').Socket} socket */ async (socket) => {
    await handleConnection(socket, { socketServer, socketUsers, colorGame, getActivePollData, recordVote, getActivePollId });
  });
}

export default attachSocketHandlers;

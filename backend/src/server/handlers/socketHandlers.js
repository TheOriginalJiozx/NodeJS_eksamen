import attachAdminServerMethods from '../utils/adminUtils.js';
import handleConnection from './connectionHandlers.js';

/**
 * @param {import('socket.io').Server} socketServer
 * @param {{ socketUsers: Record<string,any>, onlineAdmins: Set<string>, colorGame:any, activePollId?: number|null, getActivePollData?: Function, recordVote?: Function, getActivePollId?: Function }} options
 */
export function attachSocketHandlers(socketServer, { socketUsers, onlineAdmins, colorGame, activePollId, getActivePollData, recordVote, getActivePollId }) {
  /** @type {Map<string, {username:string, sockets:Set<string>} >} */
  const adminSocketMap = new Map();

  attachAdminServerMethods(socketServer, { adminSocketMap, onlineAdmins });

  socketServer.on('connection', /** @param {import('socket.io').Socket} socket */ async (socket) => {
    await handleConnection(socket, { socketServer, socketUsers, onlineAdmins, colorGame, getActivePollData, recordVote, getActivePollId });
  });
}

export default attachSocketHandlers;

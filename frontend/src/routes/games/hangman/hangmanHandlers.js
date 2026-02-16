import logger from '../../../lib/logger.js';
import { toast } from 'svelte-5-french-toast';

/**
 * @param {import('socket.io-client').Socket} socket
 * @param {object} setters
 */
export function attachHangmanHandlers(socket, setters) {
  if (!socket) return () => {};

  const {
    setHangmanGame,
    setPlayerScore,
    setHasActiveHangman,
    setChatMessages,
    setIsHangmanStarter,
    setHangmanUsers,
    setAvailableRooms,
    setAllHangmanUsers,
    setHangmanWinner,
    setSelectedRoomId,
    getSelectedRoomId,
    setLastAnswer,
  } = setters;

  const handleStart = (game) => {
    try {
      setHangmanGame(game ?? null);
      setPlayerScore((game && game.score) || 0);
      setHasActiveHangman(true);
      setChatMessages([]);
    } catch (error) {
      logger.debug({ error }, 'handleStart failed');
    }
  };

  const handleJoined = (data) => {
    try {
      if (typeof setSelectedRoomId === 'function') setSelectedRoomId(data?.roomId || null);
    } catch (error) {
      logger.debug({ error }, 'handleJoined failed');
    }
  };

  const handleStarter = (data) => {
    try {
      setIsHangmanStarter(!!data?.isStarter);
    } catch (error) {
      logger.debug({ error }, 'handleStarter failed');
    }
  };

  const handleUsers = (data) => {
    try {
      if (data.type === 'add') {
        const incomingUsers = Array.isArray(data.users) ? data.users : [data.users];
        setHangmanUsers((previous) => Array.from(new Set([...(previous || []), ...incomingUsers])));
      }
      if (data.type === 'remove') {
        const toRemove = Array.isArray(data.users) ? data.users : [data.users];
        setHangmanUsers((previous) => (previous || []).filter((user) => !toRemove.includes(user)));
      }
    } catch (error) {
      logger.debug({ error }, 'handleUsers failed');
    }
  };

  const handleCorrect = (data) => {
    try {
      setHangmanGame(data?.game ?? null);
    } catch (error) {
      logger.debug({ error }, 'handleCorrect failed');
    }
  };

  const handleWrong = (data) => {
    try {
      setHangmanGame(data?.game ?? null);
    } catch (error) {
      logger.debug({ error }, 'handleWrong failed');
    }
  };

  const handleDuplicate = (data) => {
    toast.error(`The letter '${data?.letter}' has already been guessed`);
  };

  const handleGameOver = (data) => {
    try {
      setHangmanGame(null);
      setHangmanWinner(data?.winner || null);
      setLastAnswer(data?.answer || null);
      setHasActiveHangman(false);
      setChatMessages([]);
      const message = data?.message || `Game is over! The word was: ${data?.answer}`;
      toast.success(message);
    } catch (error) {
      logger.debug({ error }, 'handleGameOver failed');
    }
    socket.off('joined', handleJoined);
  };

  const handleGameError = (data) => {
    toast.error(data?.message || 'Hangman error');
  };

  const handleStatus = (data) => {
    try {
      logger.debug({ data }, 'hangman: status received');
    } catch (error) {}
    setHasActiveHangman(!!data?.active);
    setAvailableRooms(data?.rooms || []);
    setAllHangmanUsers(data?.allUsers || []);
    try {
      const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
      const current = typeof getSelectedRoomId === 'function' ? getSelectedRoomId() : null;
      const roomIds = rooms.map((room) => room.id);

      if (current == null || current === '' || (current && !roomIds.includes(current))) {
        if (rooms.length > 0 && typeof setSelectedRoomId === 'function')
          setSelectedRoomId(rooms[0].id);
      }
    } catch (error) {
      logger.debug({ error }, 'auto-select room failed');
    }
  };

  const handleChat = (data) => {
    try {
      setChatMessages((previous) => [
        ...(previous || []),
        { name: data?.name, message: data?.message },
      ]);
    } catch (error) {
      logger.debug({ error }, 'handleChat failed');
    }
  };

  const handleRoomLeft = (data) => {
    try {
      const reason = data && data.reason ? data.reason : null;
      const answer = data && data.answer ? String(data.answer) : null;
      if (reason === 'creator_left') {
        try {
          const msg = answer ? `Starter left room — word was not guessed: ${answer}` : 'Starter left room — word was not guessed.';
          toast.success(msg);
        } catch (error) {
          logger.debug({ error }, 'Toast failed on creator_left');
        }
      } else {
        try {
          toast.success('Left room');
        } catch (error) {
          logger.debug({ error }, 'Toast failed on room left');
        }
      }
      try {
        if (typeof setLastAnswer === 'function') setLastAnswer(answer);
        if (typeof setHasActiveHangman === 'function') setHasActiveHangman(false);
      } catch (error) {
        logger.debug({ error }, 'Could not set lastAnswer on roomLeft');
      }
    } catch (error) {}

    setHangmanGame(null);
    setHangmanUsers([]);
    setHangmanWinner(null);
    setChatMessages([]);
    setIsHangmanStarter(false);
  };

  const handleScore = (score) => {
    try {
      setPlayerScore(typeof score === 'number' ? score : 0);
    } catch (error) {
      logger.debug({ error }, 'handleScore failed');
    }
  };

  socket.on('start', handleStart);
  socket.on('starter', handleStarter);
  socket.on('joined', handleJoined);
  socket.on('users', handleUsers);
  socket.on('correctLetter', handleCorrect);
  socket.on('wrongLetter', handleWrong);
  socket.on('duplicateLetter', handleDuplicate);
  socket.on('gameOver', handleGameOver);
  socket.on('gameError', handleGameError);
  socket.on('status', handleStatus);
  socket.on('allUsers', (users) => {
    try {
      setAllHangmanUsers(users || []);
    } catch (error) {
      logger.debug({ error }, 'handleAllUsers failed');
    }
  });
  socket.on('chat', handleChat);
  socket.on('roomLeft', handleRoomLeft);
  socket.on('score', handleScore);

  return () => {
    try {
      socket.off('start', handleStart);
      socket.off('starter', handleStarter);
      socket.off('users', handleUsers);
      socket.off('correctLetter', handleCorrect);
      socket.off('wrongLetter', handleWrong);
      socket.off('duplicateLetter', handleDuplicate);
      socket.off('gameOver', handleGameOver);
      socket.off('gameError', handleGameError);
      socket.off('status', handleStatus);
      socket.off('allUsers');
      socket.off('chat', handleChat);
      socket.off('roomLeft', handleRoomLeft);
      socket.off('score', handleScore);
    } catch (error) {
      logger.debug({ error }, 'cleanup handlers failed');
    }
  };
}

export default attachHangmanHandlers;

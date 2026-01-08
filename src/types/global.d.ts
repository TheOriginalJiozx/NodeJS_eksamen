declare global {
  interface Window {
    // globalSocket is the shared Socket.IO client instance exposed on window
    globalSocket?: any;
  }
}

export {};

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const clients = new Map(); // Store clients (userId -> ws connection)

// Helper function to verify JWT and get user data
const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return reject('Invalid or expired token');
      }
      const user = await User.findById(decoded.userId);
      if (!user) {
        return reject('User not found');
      }
      resolve(user);
    });
  });
};

const setupWebSocket = (wss) => {
  wss.on('connection', async (ws, req) => {
    // Parse token from query parameters
    const token = req.url.split('token=')[1];

    try {
      // Authenticate user via token
      const user = await verifyToken(token);

      // Store the WebSocket connection
      clients.set(user._id.toString(), ws);
      console.log(`User ${user._id} connected via WebSocket`);

      // Handle WebSocket disconnection
      ws.on('close', () => {
        clients.delete(user._id.toString());
        console.log(`User ${user._id} disconnected`);
      });

      // Handle incoming messages from the client (optional)
      ws.on('message', (message) => {
        console.log(`Received message from ${user._id}: ${message}`);
      });

    } catch (error) {
      console.log('WebSocket authentication error:', error);
      ws.close(); // Close the connection if authentication fails
    }
  });
};

// Send notification to specific user
const sendNotificationToClient = (userId, message) => {
  const client = clients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  } else {
    console.log(`User ${userId} is not connected`);
  }
};

module.exports = { setupWebSocket, sendNotificationToClient };

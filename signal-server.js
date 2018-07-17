// https://github.com/websockets/ws

const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');

const server = https.createServer({
  pfx: fs.readFileSync('cjw_dk.pfx'),
  passphrase: '12345678'
});

const wss = new WebSocket.Server({ server });

var pools = {},
generateUUID = function() { // Public Domain/MIT
	var d = new Date().getTime();
	if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
		d += performance.now(); //use high-precision timer if available
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = (d + Math.random() * 16) % 16 | 0;
		d = Math.floor(d / 16);
		return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
	});
};

wss.on('connection', socket => {
	socket.on('message', msg => {
		
		// Parse the incommming stringified object
		var message = JSON.parse(msg),

		// Find the corresponding pool, and if it does not exist, create it.
		pool = pools[message.pool] = pools[message.pool] || [];

		// The very first message will be of type "connect"
		if (message.type === "connect") {

			// Create a wrapper object, with a unique id, that will follow the client for the entire lifetime of the socket, from connected to disconnected.
			var socketWrapper = {
				id: generateUUID(),
				socket: socket
			};

			// Communicate back to the connecting client, that the connection is established, and which id it has been assigned.
			socket.send(JSON.stringify({
				id: socketWrapper.id,
				type: "connectionEstablished",
				pool: message.pool
			}));

			// Communicate out to all other clients in the corresponding pool, that a new client with this specific id has connected.
			for (var i = 0; i < pool.length; i++) {
				pool[i].socket.send(JSON.stringify({
					id: socketWrapper.id,
					type: "connected",
					pool: message.pool
				}));
			}

			// Add the socket wrapper to the pool.
			pool.push(socketWrapper);
		}
		else { // All other messages than "connect" are just echoed out to all others in the same pool.
			for (var i = 0; i < pool.length; i++) {
				var client = pool[i].socket;
				
				if (client !== socket) { // Socket is not self
					client.send(msg);
				}
			}
		}
	});
	
	socket.on('close', () => { // When a socket closes, we do not receive any information about it, se we have to look it up.		
		var cleanedPool = null;
		
		// First we loop through all known pools.
		for (var poolName in pools) {
			var pool = pools[poolName],
			foundId = null;

			// Then we loop through the pool, to find the socket instance.
			for (var i = 0; i < pool.length; i++) {				
				if (pool[i].socket === socket) {
					// When we locate the socket, we temporarily store the id and remove the socket from the pool.
					foundId = pool[i].id;
					pool.splice(i, 1);
					break;
				}
			}
			
			if (foundId !== null) {
				// If foundId is set, it means we are in the correct pool, so we communicate out to all other clients in this pool, that this client has disconnected.
				for (var i = 0; i < pool.length; i++) {
					pool[i].socket.send(JSON.stringify({
						id: foundId,
						type: "disconnected",
						pool: poolName
					}));
				}

				cleanedPool = poolName;
				break;
			}
		}

		// Finally if the pool we deleted from is now empty, we delete it from the pools variable.
		if (cleanedPool !== null) {
			if (cleanedPool.length === 0) {
				delete pools[cleanedPool];
			}			
		}
	});
});

server.listen(3210);

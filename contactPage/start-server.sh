#!/bin/bash

# Decrypt the server.js file
gpg --decrypt --output server.js server.js.gpg

# Run the server (assuming you're using Node.js)
node server.js

# Optionally, remove the decrypted server.js file after running the server for security
rm server.js

# Run the server (assuming you're using Node.js)
node server.js

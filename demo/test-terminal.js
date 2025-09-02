const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('Connected to server');
    
    // Test with Alpine container (no bash)
    socket.emit('terminal:create', { 
        containerId: '4c8a302c3bf4dd21fe83c08d97c703dadbc1a0062a7d48303026b35c279e25c1' 
    });
});

socket.on('terminal:connected', (data) => {
    console.log('Terminal connected:', data);
    
    // Send a test command
    socket.emit('terminal:input', 'echo "Hello from terminal"\n');
    
    // Exit after test
    setTimeout(() => {
        socket.emit('terminal:input', 'exit\n');
    }, 1000);
});

socket.on('terminal:data', (data) => {
    console.log('Terminal output:', data);
});

socket.on('terminal:error', (error) => {
    console.error('Terminal error:', error);
    process.exit(1);
});

socket.on('terminal:exit', (data) => {
    console.log('Terminal exited:', data);
    process.exit(0);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});
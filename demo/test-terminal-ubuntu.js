const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('Connected to server');
    
    // Test with Ubuntu container (has bash)
    socket.emit('terminal:create', { 
        containerId: '963381c4c543908dbd7828035f753135723de6faadd943d04e8e3c2c44e9c61b' 
    });
});

socket.on('terminal:connected', (data) => {
    console.log('Terminal connected:', data);
    
    // Send a test command
    socket.emit('terminal:input', 'echo $SHELL\n');
    
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
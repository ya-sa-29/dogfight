
import { EventEmitter } from 'node:events';

const mode = process.argv[2];

console.log(`Starting error demonstration: ${mode}`);

const emitter = new EventEmitter();

if (mode === 'emitter') {
    // No "error" listener registered.
    setTimeout(() => {
        emitter.emit('error', new Error('Something went wrong in EventEmitter'));
    }, 100);
} else if (mode === 'rejection') {
    // Promise rejection is not handled.
    setTimeout(() => {
        Promise.reject(new Error('Something went wrong in Promise'));
    }, 100);
} else {
    console.log('Usage: node server/src/error-demo.js emitter|rejection');
    process.exit(1);
}

// This message should repeat while the process is alive.
setInterval(() => {
    console.log('Process is still running...');
}, 500);

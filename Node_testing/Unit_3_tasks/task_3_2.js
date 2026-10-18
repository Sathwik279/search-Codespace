// tick every 50 ms
import { emit } from 'node:cluster';
import EventEmitter from 'node:events';
function rec(rem, ticks, eventEmitter, cb){
    if(rem==0){
        cb(null, ticks);
        return;
    }
    if(rem<50){
        setTimeout(()=>{
            rec(0,ticks,eventEmitter,cb);
        },rem);
        return;
    }
    if(Date.now()%5==0){
        cb('we got some issue the time stamp is div by 5',ticks);
        eventEmitter('error',new Error("we got some issue with the div we are emitting"));
        return;
    }
    setTimeout(()=>{
        eventEmitter.emit('tick',`tick every 50 ms cnt is ${ticks}`);
        rec(rem-50,ticks+1, eventEmitter,cb);
    }, 50);

}

function ticker(num, cb){
    const eventEmitter = new EventEmitter();
    let ticks = 0;
    process.nextTick(()=>{
        eventEmitter.emit('start');
    })
    rec(num,0,eventEmitter,cb);
    // the above being an asynchronous function we can count for the 50 ms here
    
    return eventEmitter;
}

const event = ticker(1050,(err,ticks)=>{
    if(err){
        console.log(`error has come ${err.message}`);
    }
    console.log(ticks);
})
event.on('tick', (msg)=>{
    console.log(msg);
})
event.on('start',()=>{
    console.log('started');
})
event.on('error',(err)=>{
    console.log(`caught at the emitter ${err.message}`);
})
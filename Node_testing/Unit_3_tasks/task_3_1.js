import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs';

class FindRegex extends EventEmitter{
    constructor(regex){
        super();
        this.regex = regex;
        this.files = [];
    }

    addFile(file){
        this.files.push(file);
        return this;
    }

    find(){
        this.emit('start', this.files);
        for(const file of this.files){
            readFile(file, 'utf-8', (err, content)=>{
                if(err){
                    return this.emit('error', err);
                }
                
                this.emit('fileread',file);

                const match = content.match(this.regex);
                if(match){
                    for(const elem of match){
                        this.emit('found',file,elem);
                    }
                }
            })
        }
        return this;
    }
}

const findRegexInstance = new FindRegex('sathwik')
findRegexInstance
 .addFile('fileA.txt')
 .addFile('fileB.txt')
 // this listener is invoked
 .on('start',(filesArray)=>{
    console.log(filesArray);
 })
 .on('found', (file, match) =>
 console.log(`[Before] Matched "${match}"`))
 // this listener is never invoked
 .on('found', (file, match) => console.log(`[After] Matched "${match}"`))

 .find()
 
// need a few imports
import { get } from 'node:http';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs';
// we need to create a download function

function download(url, callback){
    let eventEmitter = new EventEmitter();
    const req = get(url, resp => {
        const chunks = [];
        let downloadedBytes = 0;
        const fileSize = Number.parseInt(resp.headers['content-length'],10);
        
        resp
        .on('error', err => {
            callback(err);
        })
        .on('data', chunk =>{
            chunks.push(chunk);
            downloadedBytes+=chunk.length;
            eventEmitter.emit('progress', downloadedBytes, fileSize);
        })
        .on('end', ()=>{
            const data = Buffer.concat(chunks);
            callback(null,data);
        })
    })

    req.on('error',err => {
        callback(err);
    })

    return eventEmitter;
}

download(
 'http://45.3.63.28:6060/d4/z/anon/f2/1791619543/129/g6/zlib3_files/20251027/annas_archive_data__aacid__zlib3_files__20251027T180356Z--20251027T180357Z/aacid__zlib3_files__20251027T180356Z__119726746__C4ydPNrSnUDbkTpcCbvQ6j~/UQov_TwEx2S1Xg9QGocggw/Node_js%20Design%20Patterns%2C%20Fourth%20Edition%3A%20Level%20up%20your%20--%20Luciano%20Mammino%2C%20Mario%20Casciaro%20--%20Expert%20Insight%2C%20Fourth%2C%202025%20--%20Packt%20Publishing%20Limited%20--%20isbn13%209781803238944%20--%205ebe0a2730c5520e4def7efc8539514a%20--%20Anna%E2%80%99s%20Archive.pdf',
 (err, data) => {
 if (err) {
    return console.error(`Download failed: ${err.message}`)
 }
    writeFile('downloaded_file.zip', data, (writeError)=>{
        console.log(`failed to save file! ${writeError.message}`);
    })
    console.log("file has be downloaded successfully");
 }
).on('progress', (downloaded, total) => {
 console.log(
 `${downloaded}/${total} ` +
 `(${((downloaded / total) * 100).toFixed(2)}%)`
 )
})
import { recursiveMkdir } from "./utils"

export function spider(url, cb){
    const filename = urlToFilename(url)
    exists(filename, (err, alreadyExists) => {
        if(err){
            cb(err)
        }else if(alreadyExists){
            cb(null, filename, false)
        }else{
            console.log(`Downloading ${url} into ${filename}`)
            get(url, (err, content) => {
                if(err){
                    cb(err)
                }else{
                    recursiveMkdir(dirname(filename), err => {
                        if(err){
                            cb(err)
                        }else{
                            writeFile(filename, content, err => {
                                if(err){
                                    cb(err)
                                }else{
                                    cb(null, filename, true)
                                }
                            })
                        }
                    })
                }
            })
        }
    })
}
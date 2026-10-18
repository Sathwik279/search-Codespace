// this file contains the utilities used in the project in which it is used.

import {URL} from 'node:url'


// url parser

export function parse_url(url){
    const parsed_url = new URL(url);
    const urlComponents = parsed_url.pathname.split('/');
}





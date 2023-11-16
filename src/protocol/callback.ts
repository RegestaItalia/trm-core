import axios from "axios";
import url from "url";

const args = process.argv;
var endpoint: string;
var protocolUrl: string;
try{
    endpoint = args[2];
    protocolUrl = args[3];
}catch(e){ }
if(!endpoint || !protocolUrl){
    throw new Error("Missing arguments.");
}
var urlParse: url.UrlWithParsedQuery;
try{
    urlParse = url.parse(protocolUrl, true);
}catch(e){
    throw new Error("Couldn't parse URL.");
}
axios.post(endpoint, {
    path: urlParse.href,
    parameters: urlParse.query
}).then(() => {
    console.log("Callback called.");
}).catch(err => {
    console.error(err);
});
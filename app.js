const request = require('request');
var events = require('events');
var eventEmitter = new events.EventEmitter();
const cheerio = require('cheerio');
const validUrl=/^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/g;
const R= require('ramda');
const csvdata = require('csvdata');
var visited ={};

const websiteUrl = 'https://www.medium.com';

var queue=[];
var running=0; //number of active request
var manualShift = false;
var max=5;// number of ma connections


const next = (func) => {
  if (running <= concurrent && queue.length > 0) {
    queue.shift()();
    // console.log("less");
  } else if (running >= concurrent) {
    queue.push(func);
  } else {
    func();
  }
}
const getLinks = (url) => {
  return new Promise((resolve,reject) =>{
    if(manualShift)
      {
        queueShift();
        reject();
      }
    if (!R.isNil(visited[url])) {//For checking already visited urls
      queueShift();
      reject();
    }
    console.log("Trying Url "+url);
    request(url, (err, res, html) => {
      if (!R.isNil(visited[url])) {//For checking already visited urls
        queueShift();
        reject();
      }
      if (!err && res.statusCode == 200) {
        // if (manualShift || queue.length > 100)//If want to stop hitting request after some limit just give that limit in condition
        // {
        //   console.log("manual shift");
        //   queueShift();
        //   manualShift = true;
        //   return null;
        // }
        let $ = cheerio.load(html);
        let arr = [];
        $('body').find('a').each(function () {
          let href = $(this).attr('href');
          if (href != null && href != undefined && R.isNil(visited[href]) && validUrl.test(href)) {
            visited[href] = 1;
            queue.push(href);
            queueShift();
          }
        });
        resolve();
      }
      if (err || res.statusCode != 200) {
        console.log("Error Occured for " + url);
        queueShift();
        reject();
      }
    })
  })
}

const queueShift = () =>{
  // console.log("Concurrent connections "+running);//Uncomment if you want to see concurrent connections
  if(manualShift){
    queue.shift();
  }
  if(running < max && queue.length>0){//if running connections are less hit more till max
    while(running<max)
      {
        if(queue.length == 0)
          break;
        running++;
        getLinks(queue.shift()).then(x=>{running--;}).catch(err=>{running--;});
      }
  }
  else if(queue.length == 0 && running == 0){
    eventEmitter.emit('end');
  }
}

const eventWaiterForCrawling = (url) =>{
  return new Promise((resolve,reject)=>{
    getLinks(url);
    eventEmitter.on('end', ()=>{
      console.log("Website crawling finished");
      resolve(visited);
    });
  })
}

const crawlAndStoreToFile =  (url) =>{

  console.log('Started Crawling '+url);
  return eventWaiterForCrawling(url)
    .then(data =>{
      return Object.keys(data).map(url =>{
        let x={};
        x['Web Urls']=url;
        return x
      });
    })
    .then(jsonObj =>csvdata.write('./webLinks.csv',jsonObj,{log:false,header: 'Web Urls'}))
    .then(data=>{
      console.log("Data Written to webLinks.csv file")
      return Object.keys(visited);
    })
    .catch(err =>{
      console.error(err);
    })
}

const startCrawling = url =>{
  crawlAndStoreToFile(url)
  .then(urls =>{
    console.log("Found "+urls.length+" urls from "+url );
    console.log("Exiting:");
    process.exit();
  })
  .catch(err =>{
    console.log("Something went wrong Please try again later");
  })
}

process.on('SIGINT', function() {
  console.log("Interrupt signal Wrtting urls to file");
  let json = Object.keys(visited).map(url =>{
    let x={};
    x['Web Urls']=url;
    return x
  });
  csvdata.write('./webLinks.csv',json,{log:false,header: 'Web Urls'}).then(
    () =>{
      console.log("Urls writtent to webLinks.csv");
      process.exit();
    }
  )
});

startCrawling(websiteUrl);
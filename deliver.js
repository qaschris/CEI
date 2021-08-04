const cp = require('child_process');
// This script requires the 'request' node.js module.
// This section grabs required node modules not packaged with
// the Automation Host service prior to executing the script.
const req = async module => {
  try {
    require.resolve(module);
  } catch (e) {
    console.log(`=== could not resolve "${module}" ===\n=== installing... ===`);
    cp.execSync(`npm install ${module}`);
    await setImmediate(() => {});
    console.log(`=== "${module}" has been installed ===`);
  }
  console.log(`=== requiring "${module}" ===`);
  try {
    return require(module);
  } catch (e) {
    console.log(`=== could not include "${module}" ===`);
    console.log(e);
    process.exit(1);
  }
}

const main = async () => {

    const { execSync } = await req("child_process");
    const fs = await req('fs');
    const path = await req('path');
    const request = await req('request');
    const util = require('util');

    const readDirAsync = util.promisify(fs.readdir);
    const readFileAsync = util.promisify(fs.readFile);
    const statAsync = util.promisify(fs.stat);
    
    const pulseUri = 'https://pulse-us-east-1.qtestnet.com/webhook/7c102b40-228f-461f-b11c-239d1f174d30';                // Pulse parser webhook endpoint
    const projectId = '74528';               // target qTest Project ID
    const cycleId = '7184713';                 // target qTest Test Cycle ID
    let resultsPath = 'C:\\repo\\- Customer Specific -\\Cox\\CSVReportGeneration';      // Edit this to reflect your results file, be certain to escape the slashes as seen below.
    let archivePath = 'C:\\repo\\- Customer Specific -\\Cox\\CSVReportGeneration\\Archive';
    let resultSuffix = '.csv';
    
    let filename;
    let result;
    let encodedResults;
    
    
    // Build command line for test execution.  Place any scripts surrounding build/test procedures here.
    // Comment out this section if build/test execution takes place elsewhere.
    // let command = '';
    
    // console.log(`=== executing command ===`);
    // console.log(command);
    // execSync(command, {stdio: "inherit"});
    // console.log(`=== command completed ===`);
    // Build section end.


    // This function will get the latest filename from the resultsPath to read in the results.
    const readDirChronoSorted = async(dirpath, order, extension) => {
        const fileNamesArray = await new Promise(async(resolve, reject) => {
            order = order || 1;
            var files = await readDirAsync(dirpath);
            files = files.filter(function(file) {
                return path.extname(file).toLowerCase() === extension;
            });
            console.log('=== read path ' + dirpath + ' successfully ===');
            const stats = await Promise.all(
                files.map((filename) =>
                    statAsync(path.join(dirpath, filename))
                .then((stat) => ({ filename, stat }))
                )
            );
            resolve(stats.sort((a, b) =>
                order * (b.stat.ctime.getTime() - a.stat.ctime.getTime())
            ).map((stat) => stat.filename));
        })
        return fileNamesArray[0];
    }

    const readResults = async() => {
        await new Promise(async(resolve, reject) => {
            filename = await readDirChronoSorted(resultsPath, 1, resultSuffix);
            console.log('=== inspecting file: ' + filename + ' ===');
            await readFileAsync(resultsPath + '\\' + filename, null, async function (err, data) {
                // base64 encode the results file
                var buff = new Buffer.from(data);
                encodedResults = buff.toString('base64');
                console.log('=== read results file ' + resultsPath + '\\' + filename + ' successfully ===');
                resolve('Read results successfully.');
                return;
            });
        });
    }

    const deliverResults = async() => {
        await new Promise(async(resolve, reject) => {
            let opts = {
                    url: pulseUri,
                    json: true,
                    body: {
                        'projectId': projectId,
                        'testcycle': cycleId,
                        'result': encodedResults
                    }
                };
            // perform the post
            console.log('=== uploading results... ===')
            await request.post(opts, async function(err, response, resbody) {
                if (err) {
                    reject(err);
                } else {
                    //console.log(response);
                    //console.log(resbody);
                    console.log('=== uploaded results successfully ===')
                    resolve('Uploaded results successfully.');
                }
            });
        });
    }

    const archiveResults = async() => {
        await new Promise(async(resolve, reject) => {
            let fileToBeArchived = path.resolve(resultsPath, filename);
            let destinationPath = path.resolve(archivePath, filename);

            fs.rename(fileToBeArchived, destinationPath, (err) => {
                if (err) {
                    console.log('=== error archiving file: ' + err);
                    reject();
                } else {
                    console.log('=== file ' + fileToBeArchived + ' successfully archived to ' + archivePath + ' ===');
                    resolve();
                }
            })
        })
    }

    try {
        await readResults().then(async () => {
            //console.log("successfully read results");
            await deliverResults().then(async () => {
                //console.log("successfully read attachments");
                archiveResults().then(async () => {
                    //console.log('=== uploaded results successfully ===')
                });
            });
        }).catch((err) => {
            console.log(err);
        })
        /*.then(async() => {
            await readAttachments().then(async() => {                
                await deliverResults();
            });
        });*/
    } catch (err) {
        console.log('=== error: ', err.stack, ' ===');
    }
};

main();